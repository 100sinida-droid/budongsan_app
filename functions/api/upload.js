import { onUpload } from './_lib.js';
export const onRequestPost = (ctx) => onUpload(ctx.request, ctx.env);
