// ============================================================
// Community Features - Rating and Review System
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export interface Review {
  id: string;
  pluginName: string;
  author: string;
  rating: number;
  title?: string;
  comment?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewStats {
  pluginName: string;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: { [rating: number]: number };
  recentReviews: Review[];
}

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.devflow');
}

function generateReviewId(pluginName: string, author: string): string {
  const raw = `${pluginName}:${author}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

export class ReviewManager {
  private reviews: Map<string, Review[]> = new Map();
  private filePath: string;

  constructor(configDir?: string) {
    const dir = configDir ? resolveHome(configDir) : defaultConfigDir();
    this.filePath = path.join(dir, 'reviews.json');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const data: Review[] = JSON.parse(raw);
      this.reviews.clear();
      for (const review of data) {
        const list = this.reviews.get(review.pluginName) ?? [];
        list.push(review);
        this.reviews.set(review.pluginName, list);
      }
    } catch {
      this.reviews.clear();
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const all: Review[] = [];
    for (const list of this.reviews.values()) {
      all.push(...list);
    }
    await fs.writeFile(this.filePath, JSON.stringify(all, null, 2), 'utf-8');
  }

  addReview(pluginName: string, review: Omit<Review, 'id' | 'createdAt'>): Review {
    if (review.rating < 1 || review.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    const id = generateReviewId(pluginName, review.author);
    const now = new Date().toISOString();
    const newReview: Review = { ...review, id, pluginName, createdAt: now };
    const list = this.reviews.get(pluginName) ?? [];
    list.push(newReview);
    this.reviews.set(pluginName, list);
    return newReview;
  }

  updateReview(reviewId: string, updates: Partial<Review>): Review | null {
    for (const list of this.reviews.values()) {
      const idx = list.findIndex((r) => r.id === reviewId);
      if (idx >= 0) {
        const existing = list[idx];
        if (updates.rating !== undefined && (updates.rating < 1 || updates.rating > 5)) {
          throw new Error('Rating must be between 1 and 5');
        }
        const updated: Review = {
          ...existing,
          ...updates,
          id: existing.id,
          pluginName: existing.pluginName,
          author: existing.author,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        list[idx] = updated;
        return updated;
      }
    }
    return null;
  }

  deleteReview(reviewId: string): boolean {
    for (const [pluginName, list] of this.reviews) {
      const idx = list.findIndex((r) => r.id === reviewId);
      if (idx >= 0) {
        list.splice(idx, 1);
        if (list.length === 0) {
          this.reviews.delete(pluginName);
        }
        return true;
      }
    }
    return false;
  }

  getReviews(
    pluginName: string,
    options?: { sort?: 'newest' | 'oldest' | 'highest' | 'lowest'; limit?: number },
  ): Review[] {
    const list = [...(this.reviews.get(pluginName) ?? [])];
    const sort = options?.sort ?? 'newest';
    switch (sort) {
      case 'newest':
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'highest':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        list.sort((a, b) => a.rating - b.rating);
        break;
    }
    if (options?.limit) {
      return list.slice(0, options.limit);
    }
    return list;
  }

  getStats(pluginName: string): ReviewStats {
    const list = this.reviews.get(pluginName) ?? [];
    const totalReviews = list.length;
    const ratingDistribution: { [rating: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of list) {
      sum += r.rating;
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
    }
    const averageRating = totalReviews > 0 ? Math.round((sum / totalReviews) * 100) / 100 : 0;
    const recentReviews = [...list]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    return { pluginName, averageRating, totalReviews, ratingDistribution, recentReviews };
  }

  getUserReview(pluginName: string, author: string): Review | undefined {
    const list = this.reviews.get(pluginName) ?? [];
    return list.find((r) => r.author === author);
  }

  getTopRated(limit: number = 10): { pluginName: string; stats: ReviewStats }[] {
    const results: { pluginName: string; stats: ReviewStats }[] = [];
    for (const pluginName of this.reviews.keys()) {
      const stats = this.getStats(pluginName);
      if (stats.totalReviews > 0) {
        results.push({ pluginName, stats });
      }
    }
    results.sort((a, b) => b.stats.averageRating - a.stats.averageRating);
    return results.slice(0, limit);
  }

  getMostReviewed(limit: number = 10): { pluginName: string; stats: ReviewStats }[] {
    const results: { pluginName: string; stats: ReviewStats }[] = [];
    for (const pluginName of this.reviews.keys()) {
      const stats = this.getStats(pluginName);
      if (stats.totalReviews > 0) {
        results.push({ pluginName, stats });
      }
    }
    results.sort((a, b) => b.stats.totalReviews - a.stats.totalReviews);
    return results.slice(0, limit);
  }
}

export const reviewManager = new ReviewManager();
