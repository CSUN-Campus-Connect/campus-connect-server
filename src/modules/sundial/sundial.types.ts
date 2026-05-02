import { SundialNewsCategory } from "@prisma/client";

export interface SundialArticle {
  id: string;
  category: SundialNewsCategory;
  title: string;
  date: Date;
  link: string;
  image: string | null;
  createdAt: Date;
}

export interface SundialDateRangeQuery {
  rangeStart: Date;
  rangeEnd: Date;
  category?: SundialNewsCategory;
  limit?: number;
}

export interface GetAllSundialQuery {
  limit?: number;
}
