import prisma from "@/utils/prisma";
import { SundialArticle, SundialDateRangeQuery } from "./sundial.types";

/**
 * Fetch sundial news articles whose `date` falls within [rangeStart, rangeEnd].
 * Optionally filter by category.
 * Results are ordered newest-first.
 */
export const getNewsByDateRange = async (
  query: SundialDateRangeQuery
): Promise<{ total: number; data: SundialArticle[] }> => {
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
    orderBy: { date: "desc" },
  });

  return {
    total: articles.length,
    data: articles,
  };
};

/**
 * Fetch all sundial news articles, ordered newest-first.
 */
export const getAllNews = async (): Promise<{
  total: number;
  data: SundialArticle[];
}> => {
  const articles = await prisma.sundialNews.findMany({
    orderBy: { date: "desc" },
  });

  return {
    total: articles.length,
    data: articles,
  };
};
