import { html } from 'hono/html';
import { jsxRenderer } from 'hono/jsx-renderer';

export const renderer = jsxRenderer(({ children }) => {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        <title>管理ページ</title>
      </head>
      <body>
        ${children}
      </body>
    </html>
  `;
});

export const Image = ({ fileName }: { fileName: string }) => {
  return (
    <div>
      <a href={`/${fileName}`}>{fileName}</a> <button>copy url</button>{' '}
      <button hx-get={`/my/${fileName}/src`} hx-swap="outerHTML">
        src
      </button>
      <br />
      <img src={`/${fileName}`} width={300} />
    </div>
  );
};
