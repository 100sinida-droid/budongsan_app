import { onVisit } from './_lib.js';
export const onRequestGet = (ctx) => onVisit(ctx.request, ctx.env);
export const onRequestPost = (ctx) => onVisit(ctx.request, ctx.env);
