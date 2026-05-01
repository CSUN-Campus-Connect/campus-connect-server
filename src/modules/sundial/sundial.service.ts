import prisma from "@/utils/prisma";
import { GetAllSundialQuery, SundialArticle, SundialDateRangeQuery } from "./sundial.types";
import { SundialNewsCategory } from "@prisma/client";

const SUNDIAL_BASE_URL = "https://sundial.csun.edu";
const WP_API_BASE_URL = `${SUNDIAL_BASE_URL}/wp-json/wp/v2`;
const LIVE_FETCH_TIMEOUT_MS = 6000;
const CATEGORY_ID_TTL_MS = 6 * 60 * 60 * 1000;
const LIVE_FETCH_MAX_PER_CATEGORY = 25;

const clampLimit = (value?: number) => {
  if (!value || Number.isNaN(value)) return undefined;
  return Math.min(Math.max(value, 1), 100);
};

const LIVE_CATEGORY_SLUGS: Record<SundialNewsCategory, string[]> = {
  news: ["news", "campus-news", "local-and-national"],
  sports: ["sports"],
  culture: ["culture"],
  multimedia: ["multimedia"],
};

const categoryIdCache = new Map<string, { id: number; expiresAt: number }>();

type WpRenderedField = { rendered?: string };
type WpMedia = { source_url?: string };
type WpPost = {
  id: number;
  date?: string;
  modified?: string;
  link?: string;
  title?: WpRenderedField;
  _embedded?: {
    [key: string]: WpMedia[] | undefined;
  };
};

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&#038;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const buildAbortSignal = () => AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS);

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dedupeArticles = (articles: SundialArticle[]) => {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.link || article.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortNewestFirst = (articles: SundialArticle[]) =>
  [...articles].sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    if (bDate !== aDate) return bDate - aDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

const getCategoryIdBySlug = async (slug: string): Promise<number | null> => {
  const cached = categoryIdCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.id;
  }

  const url = `${WP_API_BASE_URL}/categories?slug=${encodeURIComponent(slug)}&per_page=1`;
  const res = await fetch(url, {
    method: "GET",
    signal: buildAbortSignal(),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = (await res.json()) as Array<{ id?: number }>;
  const id = json?.[0]?.id;
  if (!id) return null;

  categoryIdCache.set(slug, { id, expiresAt: Date.now() + CATEGORY_ID_TTL_MS });
  return id;
};

const mapWpPostToArticle = (post: WpPost, category: SundialNewsCategory): SundialArticle | null => {
  const publishedAt = parseDate(post.date);
  if (!publishedAt || !post.link) return null;

  const modifiedAt = parseDate(post.modified) ?? publishedAt;
  const title = stripHtml(post.title?.rendered ?? "");
  if (!title) return null;

  const media = post._embedded?.["wp:featuredmedia"]?.[0];

  return {
    id: `wp-${post.id}`,
    category,
    title,
    date: publishedAt,
    link: post.link,
    image: media?.source_url ?? null,
    createdAt: modifiedAt,
  };
};

const fetchLiveCategoryArticles = async (
  category: SundialNewsCategory,
  options: { limit?: number; rangeStart?: Date; rangeEnd?: Date } = {}
): Promise<SundialArticle[]> => {
  const slugs = LIVE_CATEGORY_SLUGS[category];
  const categoryIds = (await Promise.all(slugs.map((slug) => getCategoryIdBySlug(slug)))).filter(
    (value): value is number => Boolean(value)
  );

  if (categoryIds.length === 0) return [];

  const perPage = Math.min(options.limit ?? LIVE_FETCH_MAX_PER_CATEGORY, LIVE_FETCH_MAX_PER_CATEGORY);
  const params = new URLSearchParams({
    per_page: String(perPage),
    orderby: "date",
    order: "desc",
    _embed: "wp:featuredmedia",
    categories: categoryIds.join(","),
  });

  if (options.rangeStart) {
    params.set("after", options.rangeStart.toISOString());
  }

  if (options.rangeEnd) {
    params.set("before", options.rangeEnd.toISOString());
  }

  const res = await fetch(`${WP_API_BASE_URL}/posts?${params.toString()}`, {
    method: "GET",
    signal: buildAbortSignal(),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return [];

  const posts = (await res.json()) as WpPost[];

  return dedupeArticles(
    posts
      .map((post) => mapWpPostToArticle(post, category))
      .filter((article): article is SundialArticle => Boolean(article))
  );
};

const fetchLiveAllArticles = async (limit?: number): Promise<SundialArticle[]> => {
  const perCategoryLimit = Math.min(Math.max(limit ?? 25, 8), LIVE_FETCH_MAX_PER_CATEGORY);
  const groups = await Promise.all(
    (Object.keys(LIVE_CATEGORY_SLUGS) as SundialNewsCategory[]).map((category) =>
      fetchLiveCategoryArticles(category, { limit: perCategoryLimit })
    )
  );

  return sortNewestFirst(dedupeArticles(groups.flat())).slice(0, limit ?? 25);
};

/**
 * Fetch sundial news articles whose `date` falls within [rangeStart, rangeEnd].
 * Optionally filter by category.
 * Prefer live WordPress data, then fall back to the local database.
 */
export const getNewsByDateRange = async (
  query: SundialDateRangeQuery
): Promise<{ total: number; data: SundialArticle[] }> => {
  const take = clampLimit(query.limit);

  if (query.category) {
    const liveArticles = await fetchLiveCategoryArticles(query.category, {
      limit: take,
      rangeStart: query.rangeStart,
      rangeEnd: query.rangeEnd,
    }).catch(() => []);

    if (liveArticles.length > 0) {
      return {
        total: liveArticles.length,
        data: sortNewestFirst(liveArticles).slice(0, take),
      };
    }
  }

  const where: Record<string, unknown> = {
    date: {
      gte: query.rangeStart,
      lte: query.rangeEnd,
    },
  };

  if (query.category) {
    where.category = query.category;
  }

  const articles = await prisma.sundialNews.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });

  return {
    total: articles.length,
    data: articles,
  };
};

/**
 * Fetch all sundial news articles, ordered newest-first.
 * Prefer live WordPress data, then fall back to the local database.
 */
export const getAllNews = async (
  query: GetAllSundialQuery = {}
): Promise<{
  total: number;
  data: SundialArticle[];
}> => {
  const take = clampLimit(query.limit);

  const liveArticles = await fetchLiveAllArticles(take).catch(() => []);
  if (liveArticles.length > 0) {
    return {
      total: liveArticles.length,
      data: liveArticles,
    };
  }

  const articles = await prisma.sundialNews.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });

  return {
    total: articles.length,
    data: articles,
  };
};
