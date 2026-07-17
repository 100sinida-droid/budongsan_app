import { onList } from './_lib.js';
export const onRequestGet = (ctx) => onList(ctx.request, ctx.env);
