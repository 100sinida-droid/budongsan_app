import { onRebuildSeo } from './_lib.js';
export const onRequestPost = (ctx) => onRebuildSeo(ctx.request, ctx.env);
