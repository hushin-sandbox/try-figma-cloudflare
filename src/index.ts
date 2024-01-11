import { Hono } from 'hono';
import { cache } from 'hono/cache';

type Bindings = {
  FIGMA_TOKEN: string;
  MY_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.post('/upload', async (c) => {
  const figmaUrl = await c.req.text();

  const [_1, fileKey] = figmaUrl.match(/\/file\/([a-zA-Z0-9]+)/) || [];
  const [_2, nodeId] = figmaUrl.match(/node-id=(\d+-\d+)/) || [];

  if (!fileKey || !nodeId) {
    return c.json({ message: 'Invalid URL' });
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
    return c.json({ message: 'Invalid URL' });
  }
  const fileName = imageUrl.split('/').at(-1) + '.png';
  const image = await fetch(imageUrl).then((res) => res.arrayBuffer());

  await c.env.MY_BUCKET.put(fileName, image, {
    httpMetadata: {
      contentType: 'image/png',
    },
  });

  return c.text(fileName);
});

app.get(
  '*',
  cache({
    cacheName: 'r2-image-worker',
  })
);

const maxAge = 60 * 60 * 24 * 30;

app.get('/:key', async (c) => {
  const key = c.req.param('key');

  const object = await c.env.MY_BUCKET.get(key);
  if (!object) return c.notFound();
  const data = await object.arrayBuffer();
  const contentType = object.httpMetadata?.contentType ?? '';

  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType,
  });
});

export default app;
