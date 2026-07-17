import { onLogin } from './_lib.js';
export const onRequestPost = (ctx) => onLogin(ctx.request, ctx.env);
