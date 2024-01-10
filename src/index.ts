import { Hono } from 'hono';

type Bindings = {
  FIGMA_TOKEN: string;
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

  const image = Object.values(imageResult.images)[0];
  if (!image) {
    return c.json({ message: 'Invalid URL' });
  }

  return c.json({ url: image });
});

export default app;
