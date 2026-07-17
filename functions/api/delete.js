import { onDelete } from './_lib.js';
export const onRequestPost = (ctx) => onDelete(ctx.request, ctx.env);
