import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default('Cam Wilson'),
    image: z.string().optional(),
  }),
});

const domains = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/domains' }),
  schema: z.object({
    domain: z.string(),
    heldBy: z.string().default('cam-wilson.com'),
  }),
});

export const collections = { blog, domains };
