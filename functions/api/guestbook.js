import { onGuestbook } from './_lib.js';
export const onRequestGet = (ctx) => onGuestbook(ctx.request, ctx.env);
export const onRequestPost = (ctx) => onGuestbook(ctx.request, ctx.env);
