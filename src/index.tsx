import { Hono } from 'hono';
import { cache } from 'hono/cache';
import { basicAuth } from 'hono/basic-auth';
import { Image, renderer } from './component';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { html } from 'hono/html';
type Bindings = {
  FIGMA_TOKEN: string;
  USER: string;
  PASS: string;
  FIGMA_IMAGE_BUCKET: R2Bucket;
  FIGMA_URL_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.use('/my/*', async (c, next) => {
  const auth = basicAuth({ username: c.env.USER, password: c.env.PASS });
  await auth(c, next);
});

app.post(
  '/my/upload',
  zValidator(
    'form',
    z.object({
      figmaUrl: z.string().min(1),
    })
  ),
  async (c) => {
    const { figmaUrl } = c.req.valid('form');

    const [_1, fileKey] = figmaUrl.match(/\/file\/([a-zA-Z0-9]+)/) || [];
    const [_2, nodeId] = figmaUrl.match(/node-id=(\d+-\d+)/) || [];

    if (!fileKey || !nodeId) {
      return c.json({ message: 'Invalid URL' }, 400);
    }

    const imageResult = (await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&scale=1&format=png`,
      {
        headers: {
          'X-Figma-Token': c.env.FIGMA_TOKEN,
        },
      }
    ).then((res) => res.json())) as { images: Record<string, string> };

    const imageUrl = Object.values(imageResult.images)[0];
    if (!imageUrl) {
      return c.json({ message: 'figma error' }, 400);
    }
    const fileName = imageUrl.split('/').at(-1) + '.png';
    const image = await fetch(imageUrl).then((res) => res.arrayBuffer());

    await Promise.all([
      c.env.FIGMA_IMAGE_BUCKET.put(fileName, image, {
        httpMetadata: {
          contentType: 'image/png',
        },
      }),
      c.env.FIGMA_URL_KV.put(fileName, figmaUrl),
    ]);

    // return c.text(fileName);
    return c.html(
      <div>
        Uploaded
        <Image fileName={fileName} />
      </div>
    );
  }
);

app.get(
  '*',
  cache({
    cacheName: 'figma-image-cache',
  })
);

const maxAge = 60 * 60 * 24 * 30;

app.get('/:key', async (c) => {
  const key = c.req.param('key');

  const object = await c.env.FIGMA_IMAGE_BUCKET.get(key);
  if (!object) return c.notFound();
  const data = await object.arrayBuffer();
  const contentType = object.httpMetadata?.contentType ?? '';

  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType,
  });
});

app.get('/my/:key/src', async (c) => {
  const key = c.req.param('key');

  const figmaUrl = await c.env.FIGMA_URL_KV.get(key);
  if (!figmaUrl) return c.notFound();
  // return c.text(figmaUrl);
  return c.html(
    <a href={figmaUrl} target="_blank">
      {figmaUrl}
    </a>
  );
});

app.get('/my/*', renderer);

app.get('/my/', async (c) => {
  const keys = await c.env.FIGMA_URL_KV.list({ prefix: '' });

  return c.render(
    <>
      {html`<style>
        .loading {
          display: none;
        }
        .htmx-request.loading {
          display: inline;
        }
      </style>`}
      <h1>My Figma Images</h1>
      <form
        hx-post="/my/upload"
        hx-target="#uploaded"
        hx-swap="afterend"
        hx-indicator=".loading"
      >
        <input type="text" name="figmaUrl" placeholder="Figma URL" />
        <button type="submit">Upload</button>
      </form>
      <div class="loading">Uploading...</div>
      <div id="uploaded"></div>
      <ul>
        {keys.keys.map(({ name }) => (
          <li>
            <Image fileName={name} />
          </li>
        ))}
      </ul>
      {html`<script>
        window.addEventListener('click', function (event) {
          const button = event.target.closest('button[data-url]');
          if (button) {
            const textToCopy =
              location.origin + '/' + button.getAttribute('data-url');
            navigator.clipboard.writeText(textToCopy);
          }
        });
      </script>`}
    </>
  );
});

export default app;
