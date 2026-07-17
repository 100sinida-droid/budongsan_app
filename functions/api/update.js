import { onUpdate } from './_lib.js';
export const onRequestPost = (ctx) => onUpdate(ctx.request, ctx.env);
