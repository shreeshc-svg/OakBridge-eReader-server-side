import { db } from '../../db/db';
import { payments, books, users, userLogs, reviews, payment_items, subscription_plans, institutions, institution_allowed_categories, institution_allowed_books, bookshelves, cart_items, free_candidate_allowed_books, contactMessages, coupons } from '../../db/schemas';
import { eq, sql, desc, asc, and, gte, lt, lte, isNull, count, sum } from 'drizzle-orm';
import { redisClient } from '../../config/redis';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const REVENUE_CACHE_KEY = 'superadmin:analytics:revenue';
const CACHE_TTL = 300; // 5 minutes

export interface RevenueMetrics {
     totalRevenue: number;
     averageSpending: number;
     bestPerformingProduct: { name: string; count: number } | null;
     leastPerformingProduct: { name: string; count: number } | null;
     weeklyGrowthPercent: number;
     monthlyGrowthPercent: number;
     reviews: {
          total: number;
          approved: number;
          pending: number;
          rejected: number;
     };
}

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
     try {
          // Check Redis cache first
          if (redisClient.isOpen) {
               const cached = await redisClient.get(REVENUE_CACHE_KEY);
               if (cached) {
                    return JSON.parse(cached);
               }
          }

          // Calculate Total Revenue and Average Spend (amount is in cents/paise, so divide by 100)
          const paymentStats = await db
               .select({
                    total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
                    avg: sql<number>`COALESCE(AVG(${payments.amount}), 0)`,
               })
               .from(payments)
               .where(
                    and(
                         eq(payments.status, 'completed'),
                         isNull(payments.tier)
                    )
               );

          const totalRevenue = (paymentStats[0]?.total || 0) / 100;
          const averageSpending = (paymentStats[0]?.avg || 0) / 100;

          // Get book sales counts
          const bookSales = await db
               .select({
                    bookId: payments.book_id,
                    title: books.title,
                    count: sql<number>`COUNT(*)::int`,
               })
               .from(payments)
               .innerJoin(books, eq(payments.book_id, books.id))
               .where(eq(payments.status, 'completed'))
               .groupBy(payments.book_id, books.title);

          // Combine and rank books
          const products: { name: string; count: number }[] = [];
          for (const s of bookSales) {
               if (s.title) {
                    products.push({ name: s.title, count: s.count });
               }
          }

          // Sort by count
          products.sort((a, b) => b.count - a.count);

          const bestPerformingProduct = products.length > 0 ? products[0] : null;
          const leastPerformingProduct = products.length > 0 ? products[products.length - 1] : null;

          // Calculate growth percentages
          const getRevenueForRange = async (startDate: Date, endDate: Date): Promise<number> => {
               const result = await db
                    .select({
                         total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
                    })
                    .from(payments)
                    .where(
                         and(
                              eq(payments.status, 'completed'),
                              isNull(payments.tier),
                              gte(payments.createdAt, startDate),
                              lt(payments.createdAt, endDate)
                         )
                    );
               return (Number(result[0]?.total) || 0) / 100;
          };

          const now = new Date();
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

          const currentWeekRev = await getRevenueForRange(sevenDaysAgo, now);
          const previousWeekRev = await getRevenueForRange(fourteenDaysAgo, sevenDaysAgo);
          const currentMonthRev = await getRevenueForRange(thirtyDaysAgo, now);
          const previousMonthRev = await getRevenueForRange(sixtyDaysAgo, thirtyDaysAgo);

          const calcGrowth = (current: number, previous: number) => {
               if (previous === 0) {
                    return current > 0 ? 100 : 0;
               }
               return parseFloat((((current - previous) / previous) * 100).toFixed(2));
          };

          const weeklyGrowthPercent = calcGrowth(currentWeekRev, previousWeekRev);
          const monthlyGrowthPercent = calcGrowth(currentMonthRev, previousMonthRev);

          // Calculate reviews statistics
          const [totalReviewsResult] = await db
               .select({ count: count() })
               .from(reviews);

          const [approvedReviewsResult] = await db
               .select({ count: count() })
               .from(reviews)
               .where(eq(reviews.status, 'approved'));

          const [pendingReviewsResult] = await db
               .select({ count: count() })
               .from(reviews)
               .where(eq(reviews.status, 'pending'));

          const [rejectedReviewsResult] = await db
               .select({ count: count() })
               .from(reviews)
               .where(eq(reviews.status, 'rejected'));

          const reviewsStats = {
               total: Number(totalReviewsResult?.count || 0),
               approved: Number(approvedReviewsResult?.count || 0),
               pending: Number(pendingReviewsResult?.count || 0),
               rejected: Number(rejectedReviewsResult?.count || 0),
          };

          const metrics: RevenueMetrics = {
               totalRevenue,
               averageSpending,
               bestPerformingProduct,
               leastPerformingProduct,
               weeklyGrowthPercent,
               monthlyGrowthPercent,
               reviews: reviewsStats,
          };

          // Cache in Redis
          if (redisClient.isOpen) {
               await redisClient.setEx(REVENUE_CACHE_KEY, CACHE_TTL, JSON.stringify(metrics));
          }

          return metrics;
     } catch (error) {
          console.error('Failed to fetch revenue analytics:', error);
          throw error;
     }
}

// Invalidate Redis cache when a new payment occurs
export async function invalidateRevenueCache(): Promise<void> {
     try {
          if (redisClient.isOpen) {
               await redisClient.del(REVENUE_CACHE_KEY);
          }
     } catch (err) {
          console.error('Failed to invalidate revenue cache:', err);
     }
}

// Paginated User Logs with optional timeframe filtering
export async function getUserLogs(page: number, limit: number, timeframe: string = 'all') {
     try {
          const offset = (page - 1) * limit;

          const conditions = [];
          if (timeframe !== 'all') {
               const now = new Date();
               let cutOffDate: Date | null = null;
               if (timeframe === 'day') {
                    cutOffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
               } else if (timeframe === 'week') {
                    cutOffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
               } else if (timeframe === 'month') {
                    cutOffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
               }
               if (cutOffDate) {
                    conditions.push(gte(userLogs.createdAt, cutOffDate));
               }
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          // Fetch logs paginated, left joining users to resolve user emails
          const logsList = await db
               .select({
                    id: userLogs.id,
                    userId: userLogs.userId,
                    userName: userLogs.userName,
                    email: users.email,
                    action: userLogs.action,
                    details: userLogs.details,
                    ipAddress: userLogs.ipAddress,
                    createdAt: userLogs.createdAt,
               })
               .from(userLogs)
               .leftJoin(users, eq(userLogs.userId, users.id))
               .where(whereClause)
               .orderBy(desc(userLogs.createdAt))
               .limit(limit)
               .offset(offset);

          // Total count for pagination metadata
          const countResult = await db
               .select({
                    count: sql<number>`COUNT(*)::int`,
               })
               .from(userLogs)
               .where(whereClause);

          const totalLogs = countResult[0]?.count || 0;

          return {
               logs: logsList,
               pagination: {
                    page,
                    limit,
                    totalLogs,
                    totalPages: Math.ceil(totalLogs / limit),
               },
          };
     } catch (error) {
          console.error('Failed to fetch user logs:', error);
          throw error;
     }
}

// Get all orders for CSV export report
export async function getOrdersReport() {
     try {
          const report = await db
               .select({
                    id: payments.id,
                    orderId: payments.razorpay_order_id,
                    buyerEmail: users.email,
                    buyerName: users.username,
                    timestamp: payments.createdAt,
                    shippingAddress: payments.shippingAddress,
                    amount: payments.amount,
                    status: payments.status,
                    tier: payments.tier,
                    directBookTitle: books.title,
               })
               .from(payments)
               .innerJoin(users, eq(payments.user_id, users.id))
               .leftJoin(books, eq(payments.book_id, books.id))
               .orderBy(desc(payments.createdAt));

          // Fetch all cart items to map book titles for cart purchases
          const cartPayments = report.filter(r => !r.directBookTitle && !r.tier);
          const cartPaymentIds = cartPayments.map(r => r.id);

          const cartItemsMap: Record<string, string[]> = {};
          if (cartPaymentIds.length > 0) {
               // Drizzle query to get payment_items and book titles
               const items = await db
                    .select({
                         paymentId: payment_items.payment_id,
                         bookTitle: books.title,
                    })
                    .from(payment_items)
                    .innerJoin(books, eq(payment_items.book_id, books.id));

               // Group by paymentId
               for (const item of items) {
                    if (!cartItemsMap[item.paymentId]) {
                         cartItemsMap[item.paymentId] = [];
                    }
                    if (item.bookTitle) {
                         cartItemsMap[item.paymentId].push(item.bookTitle);
                    }
               }
          }

          // Map items and return
          return report.map(r => {
               let bookName = 'N/A';
               if (r.directBookTitle) {
                    bookName = r.directBookTitle;
               } else if (r.tier) {
                    bookName = `${r.tier} Subscription`;
               } else {
                    const cartBooks = cartItemsMap[r.id] || [];
                    bookName = cartBooks.length > 0 ? cartBooks.join('; ') : 'Cart Purchase';
               }

               return {
                    orderId: r.orderId,
                    buyerEmail: r.buyerEmail,
                    buyerName: r.buyerName,
                    timestamp: r.timestamp,
                    shippingAddress: r.shippingAddress,
                    amount: r.amount,
                    status: r.status,
                    bookName,
               };
          });
     } catch (error) {
          console.error('Failed to fetch orders report:', error);
          throw error;
     }
}

// Get all subscription plans (admin use)
export async function getSubscriptionPlans() {
     try {
          return await db.select().from(subscription_plans).orderBy(subscription_plans.price);
     } catch (error) {
          console.error('Failed to fetch subscription plans:', error);
          throw error;
     }
}

// Get active subscription plans (client checkout use)
export async function getActiveSubscriptionPlans() {
     try {
          return await db
               .select()
               .from(subscription_plans)
               .where(eq(subscription_plans.isActive, true))
               .orderBy(subscription_plans.price);
     } catch (error) {
          console.error('Failed to fetch active subscription plans:', error);
          throw error;
     }
}

// Create a new subscription plan
export async function createSubscriptionPlan(data: {
     tier: string;
     name: string;
     price: number;
     memberLimit: number;
     durationMonths?: number;
     features: string[];
     isBestValue?: boolean;
     isActive?: boolean;
}) {
     try {
          const id = crypto.randomUUID();
          const newPlan = await db.insert(subscription_plans).values({
               id,
               tier: data.tier.toUpperCase(),
               name: data.name,
               price: data.price,
               memberLimit: data.memberLimit,
               durationMonths: data.durationMonths ?? 12,
               features: data.features,
               isBestValue: data.isBestValue ?? false,
               isActive: data.isActive ?? true,
          }).returning();
          return newPlan[0];
     } catch (error) {
          console.error('Failed to create subscription plan:', error);
          throw error;
     }
}

// Update an existing subscription plan
export async function updateSubscriptionPlan(
     id: string,
     data: {
          tier?: string;
          name?: string;
          price?: number;
          memberLimit?: number;
          durationMonths?: number;
          features?: string[];
          isBestValue?: boolean;
          isActive?: boolean;
     }
) {
     try {
          const updateData: any = {
               ...data,
               updatedAt: new Date(),
          };
          if (data.tier) {
               updateData.tier = data.tier.toUpperCase();
          }
          const updated = await db
               .update(subscription_plans)
               .set(updateData)
               .where(eq(subscription_plans.id, id))
               .returning();
          return updated[0];
     } catch (error) {
          console.error('Failed to update subscription plan:', error);
          throw error;
     }
}

// Delete a subscription plan
export async function deleteSubscriptionPlan(id: string) {
     try {
          const deleted = await db
               .delete(subscription_plans)
               .where(eq(subscription_plans.id, id))
               .returning();
          return deleted[0];
     } catch (error) {
          console.error('Failed to delete subscription plan:', error);
          throw error;
     }
}

// Get all registered institutions for superadmin
export async function getRegisteredInstitutions() {
     try {
          return await db
               .select({
                    id: institutions.id,
                    name: institutions.name,
                    location: institutions.location,
                    tier: institutions.tier,
                    subscription_expires_at: institutions.subscription_expires_at,
                    createdAt: institutions.createdAt,
                    adminUsername: users.username,
                    adminEmail: users.email,
               })
               .from(institutions)
               .leftJoin(users, eq(institutions.admin_id, users.id))
               .orderBy(desc(institutions.createdAt));
     } catch (error) {
          console.error('Failed to fetch registered institutions:', error);
          throw error;
     }
}

// Delete an institution by ID
export async function deleteInstitution(id: string) {
     try {
          // Get the institution to find its admin_id
          const inst = await db.select({ admin_id: institutions.admin_id }).from(institutions).where(eq(institutions.id, id)).limit(1);
          const adminId = inst[0]?.admin_id;

          // 1. Delete all users belonging to this institution
          await db.delete(users).where(eq(users.institution_id, id));

          // 2. Delete the admin user specifically
          if (adminId) {
               await db.delete(users).where(eq(users.id, adminId));
          }

          // 3. Delete the institution itself
          await db.delete(institutions).where(eq(institutions.id, id));
     } catch (error) {
          console.error('Failed to delete institution:', error);
          throw error;
     }
}

// Update institution email and/or subscription expiration date
export async function updateInstitution(
     id: string,
     data: {
          adminEmail?: string;
          subscription_expires_at?: string | null;
     }
) {
     try {
          // 1. Get institution details
          const instRows = await db
               .select()
               .from(institutions)
               .where(eq(institutions.id, id))
               .limit(1);

          const inst = instRows[0];
          if (!inst) {
               throw new Error('Institution not found');
          }

          // 2. Update user admin email if provided
          if (data.adminEmail !== undefined && inst.admin_id) {
               await db
                    .update(users)
                    .set({ email: data.adminEmail })
                    .where(eq(users.id, inst.admin_id));
          }

          // 3. Update subscription expiry date
          const updateData: any = {};
          if (data.subscription_expires_at !== undefined) {
               updateData.subscription_expires_at = data.subscription_expires_at
                    ? new Date(data.subscription_expires_at)
                    : null;
          }

          if (Object.keys(updateData).length > 0) {
               await db
                    .update(institutions)
                    .set(updateData)
                    .where(eq(institutions.id, id));
          }

          // 4. Return updated details
          return await db
               .select({
                    id: institutions.id,
                    name: institutions.name,
                    location: institutions.location,
                    tier: institutions.tier,
                    subscription_expires_at: institutions.subscription_expires_at,
                    createdAt: institutions.createdAt,
                    adminUsername: users.username,
                    adminEmail: users.email,
               })
               .from(institutions)
               .leftJoin(users, eq(institutions.admin_id, users.id))
               .where(eq(institutions.id, id))
               .limit(1)
               .then(rows => rows[0]);
     } catch (error) {
          console.error('Failed to update institution:', error);
          throw error;
     }
}

// Get allowed category IDs and properties for a specific institution
export async function getInstitutionAllowedCategories(institutionId: string) {
     try {
          return await db
               .select({
                    categoryId: institution_allowed_categories.category_id,
                    allowAllBooks: institution_allowed_categories.allow_all_books,
               })
               .from(institution_allowed_categories)
               .where(eq(institution_allowed_categories.institution_id, institutionId));
     } catch (error) {
          console.error('Failed to fetch institution allowed categories:', error);
          throw error;
     }
}

// Update allowed categories list and their config for a specific institution
export async function updateInstitutionAllowedCategories(
     institutionId: string,
     categoriesList: { categoryId: string; allowAllBooks: boolean }[]
) {
     try {
          await db.transaction(async (tx) => {
               // Delete existing mappings
               await tx
                    .delete(institution_allowed_categories)
                    .where(eq(institution_allowed_categories.institution_id, institutionId));

               // Insert new ones
               if (categoriesList.length > 0) {
                    const values = categoriesList.map((item) => ({
                         institution_id: institutionId,
                         category_id: item.categoryId,
                         allow_all_books: item.allowAllBooks,
                    }));
                    await tx.insert(institution_allowed_categories).values(values);
               }
          });
          return { success: true };
     } catch (error) {
          console.error('Failed to update institution allowed categories:', error);
          throw error;
     }
}

// Get allowed books for a specific institution
export async function getInstitutionAllowedBooks(institutionId: string) {
     try {
          return await db
               .select({
                    bookId: institution_allowed_books.book_id,
               })
               .from(institution_allowed_books)
               .where(eq(institution_allowed_books.institution_id, institutionId));
     } catch (error) {
          console.error('Failed to fetch institution allowed books:', error);
          throw error;
     }
}

// Update allowed books for a specific institution
export async function updateInstitutionAllowedBooks(institutionId: string, bookIds: string[]) {
     try {
          await db.transaction(async (tx) => {
               // Delete existing mappings
               await tx
                    .delete(institution_allowed_books)
                    .where(eq(institution_allowed_books.institution_id, institutionId));

               // Insert new ones
               if (bookIds.length > 0) {
                    const values = bookIds.map((bookId) => ({
                         institution_id: institutionId,
                         book_id: bookId,
                    }));
                    await tx.insert(institution_allowed_books).values(values);
               }
          });
          return { success: true };
     } catch (error) {
          console.error('Failed to update institution allowed books:', error);
          throw error;
     }
}

// Get sales & revenue report grouped by date with optional date filtering
export async function getSalesReport(startDate?: string, endDate?: string) {
     try {
          const conditions = [eq(payments.status, 'completed')];
          if (startDate) {
               conditions.push(gte(payments.createdAt, new Date(startDate)));
          }
          if (endDate) {
               const end = new Date(endDate);
               end.setHours(23, 59, 59, 999);
               conditions.push(lte(payments.createdAt, end));
          }

          const report = await db
               .select({
                    date: sql<string>`DATE(${payments.createdAt})`,
                    totalOrders: count(payments.id),
                    revenue: sum(payments.amount),
                    uniqueBuyers: sql<number>`COUNT(DISTINCT ${payments.user_id})::int`
               })
               .from(payments)
               .where(and(...conditions))
               .groupBy(sql`DATE(${payments.createdAt})`)
               .orderBy(desc(sql`DATE(${payments.createdAt})`));

          return report.map(r => ({
               date: r.date,
               totalOrders: r.totalOrders,
               revenueInr: r.revenue ? (Number(r.revenue) / 100).toFixed(2) : '0.00',
               aovInr: r.revenue && r.totalOrders ? ((Number(r.revenue) / r.totalOrders) / 100).toFixed(2) : '0.00',
               uniqueBuyers: r.uniqueBuyers
          }));
     } catch (error) {
          console.error('Failed to get sales report:', error);
          throw error;
     }
}

// Get book performance report including units, revenue, ratings, bookshelves, and cart counts
export async function getBookPerformanceReport(startDate?: string, endDate?: string) {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          if (startDate) {
               paymentConditions.push(gte(payments.createdAt, new Date(startDate)));
          }
          if (endDate) {
               const end = new Date(endDate);
               end.setHours(23, 59, 59, 999);
               paymentConditions.push(lte(payments.createdAt, end));
          }

          // 1. Fetch books with reviews stats
          const booksList = await db
               .select({
                    id: books.id,
                    title: books.title,
                    author: books.author,
                    price: books.price,
                    avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)::float`,
                    totalReviews: count(reviews.id)
               })
               .from(books)
               .leftJoin(reviews, eq(books.id, reviews.book_id))
               .groupBy(books.id);

          // 2. Fetch direct sales units & revenue
          const directSales = await db
               .select({
                    bookId: payments.book_id,
                    units: count(payments.id),
                    revenue: sum(payments.amount)
               })
               .from(payments)
               .where(and(eq(payments.status, 'completed'), ...paymentConditions))
               .groupBy(payments.book_id);

          // 3. Fetch cart item sales units & revenue
          const cartSales = await db
               .select({
                    bookId: payment_items.book_id,
                    units: count(payment_items.id),
                    revenue: sum(payment_items.price)
               })
               .from(payment_items)
               .innerJoin(payments, eq(payment_items.payment_id, payments.id))
               .where(and(eq(payments.status, 'completed'), ...paymentConditions))
               .groupBy(payment_items.book_id);

          // 4. Fetch bookshelves additions
          const shelves = await db
               .select({
                    bookId: bookshelves.book_id,
                    shelfName: bookshelves.shelf_name,
                    count: count(bookshelves.id)
               })
               .from(bookshelves)
               .groupBy(bookshelves.book_id, bookshelves.shelf_name);

          // 5. Fetch current cart additions (active)
          const cartCounts = await db
               .select({
                    bookId: cart_items.book_id,
                    count: count(cart_items.id)
               })
               .from(cart_items)
               .where(eq(cart_items.status, 'active'))
               .groupBy(cart_items.book_id);

          // Map metrics into dictionaries for easy lookup
          const directSalesMap = new Map(directSales.map(s => [s.bookId, s]));
          const cartSalesMap = new Map(cartSales.map(s => [s.bookId, s]));
          const favMap = new Map();
          const queueMap = new Map();
          for (const s of shelves) {
               if (s.shelfName === 'Favorites') favMap.set(s.bookId, s.count);
               else if (s.shelfName === 'Reading Queue') queueMap.set(s.bookId, s.count);
          }
          const cartCountMap = new Map(cartCounts.map(s => [s.bookId, s.count]));

          // Assemble the final array
          return booksList.map(book => {
               const direct = directSalesMap.get(book.id);
               const cartItem = cartSalesMap.get(book.id);

               const unitsSold = (direct?.units || 0) + (cartItem?.units || 0);
               const revenueAmount = Number(direct?.revenue || 0) + Number(cartItem?.revenue || 0);

               return {
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    priceInr: (book.price / 100).toFixed(2),
                    unitsSold,
                    revenueInr: (revenueAmount / 100).toFixed(2),
                    avgRating: book.avgRating.toFixed(1),
                    totalReviews: book.totalReviews,
                    favoritesCount: favMap.get(book.id) || 0,
                    readingQueueCount: queueMap.get(book.id) || 0,
                    cartAddsCount: cartCountMap.get(book.id) || 0
               };
          });
     } catch (error) {
          console.error('Failed to get book performance report:', error);
          throw error;
     }
}

// Get customer purchase report (LTV, registrations, last purchase)
export async function getCustomerPurchaseReport(startDate?: string, endDate?: string) {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          if (startDate) {
               paymentConditions.push(gte(payments.createdAt, new Date(startDate)));
          }
          if (endDate) {
               const end = new Date(endDate);
               end.setHours(23, 59, 59, 999);
               paymentConditions.push(lte(payments.createdAt, end));
          }

          const customerData = await db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    registrationDate: users.createdAt,
                    totalOrders: count(payments.id),
                    totalSpend: sum(payments.amount),
                    lastPurchase: sql<string>`MAX(${payments.createdAt})`
               })
               .from(users)
               .leftJoin(payments, and(eq(users.id, payments.user_id), ...paymentConditions))
               .groupBy(users.id)
               .orderBy(desc(sql`COALESCE(SUM(${payments.amount}), 0)`));

          return customerData.map(c => ({
               id: c.id,
               username: c.username,
               email: c.email,
               registrationDate: c.registrationDate ? new Date(c.registrationDate).toISOString() : '',
               totalOrders: c.totalOrders,
               totalSpendInr: c.totalSpend ? (Number(c.totalSpend) / 100).toFixed(2) : '0.00',
               lastPurchase: c.lastPurchase ? new Date(c.lastPurchase).toISOString() : 'N/A'
          }));
     } catch (error) {
          console.error('Failed to get customer purchase report:', error);
          throw error;
     }
}

// Get reviews report
export async function getReviewsReport(startDate?: string, endDate?: string) {
     try {
          const conditions = [];
          if (startDate) {
               conditions.push(gte(reviews.createdAt, new Date(startDate)));
          }
          if (endDate) {
               const end = new Date(endDate);
               end.setHours(23, 59, 59, 999);
               conditions.push(lte(reviews.createdAt, end));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const reviewsData = await db
               .select({
                    id: reviews.id,
                    bookTitle: books.title,
                    reviewerEmail: users.email,
                    rating: reviews.rating,
                    reviewText: reviews.review_text,
                    status: reviews.status,
                    createdAt: reviews.createdAt
               })
               .from(reviews)
               .innerJoin(books, eq(reviews.book_id, books.id))
               .innerJoin(users, eq(reviews.user_id, users.id))
               .where(whereClause)
               .orderBy(desc(reviews.createdAt));

          return reviewsData.map(r => ({
               id: r.id,
               bookTitle: r.bookTitle,
               reviewerEmail: r.reviewerEmail,
               rating: r.rating,
               reviewText: r.reviewText,
               status: r.status,
               createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : ''
          }));
     } catch (error) {
          console.error('Failed to get reviews report:', error);
          throw error;
     }
}

// Get admin audit/user log report
export async function getAdminAuditReport(startDate?: string, endDate?: string) {
     try {
          const conditions = [];
          if (startDate) {
               conditions.push(gte(userLogs.createdAt, new Date(startDate)));
          }
          if (endDate) {
               const end = new Date(endDate);
               end.setHours(23, 59, 59, 999);
               conditions.push(lte(userLogs.createdAt, end));
          }

          const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

          const logsData = await db
               .select({
                    id: userLogs.id,
                    email: users.email,
                    userName: userLogs.userName,
                    action: userLogs.action,
                    details: userLogs.details,
                    ipAddress: userLogs.ipAddress,
                    createdAt: userLogs.createdAt
               })
               .from(userLogs)
               .leftJoin(users, eq(userLogs.userId, users.id))
               .where(whereClause)
               .orderBy(desc(userLogs.createdAt));

          return logsData.map(l => ({
               id: l.id,
               email: l.email || 'System / Guest',
               userName: l.userName || 'N/A',
               action: l.action,
               details: l.details || '',
               ipAddress: l.ipAddress || 'N/A',
               createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : ''
          }));
     } catch (error) {
          console.error('Failed to get admin audit report:', error);
          throw error;
     }
}

// Create a new free candidate user
export async function createFreeCandidate(candidateData: { username: string; email: string; passwordStr: string }) {
     const { username, email, passwordStr } = candidateData;

     const existingUser = await db
          .select()
          .from(users)
          .where(sql`email = ${email} OR username = ${username}`)
          .limit(1);

     if (existingUser.length > 0) {
          throw new Error('Email or Username already exists');
     }

     const hashedPassword = await bcrypt.hash(passwordStr, 10);
     const newId = crypto.randomUUID();

     const [newUser] = await db
          .insert(users)
          .values({
               id: newId,
               username,
               email,
               password: hashedPassword,
               role: 'USER',
               right_click_allowed: false,
               is_free_candidate: true,
               createdAt: new Date(),
               updatedAt: new Date(),
          })
          .returning();

     return newUser;
}

// Get all free candidates
export async function getFreeCandidates() {
     return await db
          .select({
               id: users.id,
               username: users.username,
               email: users.email,
               createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.is_free_candidate, true))
          .orderBy(desc(users.createdAt));
}

// Get allowed book IDs for a free candidate
export async function getFreeCandidateAllowedBooks(userId: string) {
     const allowed = await db
          .select({ bookId: free_candidate_allowed_books.book_id })
          .from(free_candidate_allowed_books)
          .where(eq(free_candidate_allowed_books.user_id, userId));
     return allowed.map(row => row.bookId);
}

// Update allowed book IDs for a free candidate
export async function updateFreeCandidateAllowedBooks(userId: string, bookIds: string[]) {
     await db.transaction(async (tx) => {
          await tx
               .delete(free_candidate_allowed_books)
               .where(eq(free_candidate_allowed_books.user_id, userId));

          if (bookIds.length > 0) {
               const values = bookIds.map(bookId => ({
                    user_id: userId,
                    book_id: bookId,
               }));
               await tx.insert(free_candidate_allowed_books).values(values);
          }
     });
     return { success: true };
}

// Save a new contact message
export async function saveContactMessage(name: string, email: string, subject: string | undefined, message: string) {
     const [newMessage] = await db
          .insert(contactMessages)
          .values({
               name,
               email,
               subject,
               message
          })
          .returning();
     return newMessage;
}

// Get all contact messages ordered by creation date descending
export async function getContactMessages() {
     return await db
          .select()
          .from(contactMessages)
          .orderBy(desc(contactMessages.createdAt));
}

// Delete a contact message by ID
export async function deleteContactMessage(id: string) {
     return await db
          .delete(contactMessages)
          .where(eq(contactMessages.id, id));
}

// Get all coupons for superadmin dashboard
export async function getCoupons() {
     try {
          return await db
               .select()
               .from(coupons)
               .orderBy(desc(coupons.createdAt));
     } catch (error) {
          console.error('Failed to fetch coupons:', error);
          throw error;
     }
}

// Create a new coupon code
export async function createCoupon(data: {
     code: string;
     discount_type: string;
     discount_value: number;
     min_order_amount?: number | null;
     max_discount_amount?: number | null;
     expires_at?: Date | null;
     usage_limit?: number | null;
     is_active?: boolean;
}) {
     try {
          const [newCoupon] = await db
               .insert(coupons)
               .values({
                    id: crypto.randomUUID(),
                    code: data.code.trim().toUpperCase(),
                    discount_type: data.discount_type,
                    discount_value: data.discount_value,
                    min_order_amount: data.min_order_amount || null,
                    max_discount_amount: data.max_discount_amount || null,
                    expires_at: data.expires_at || null,
                    usage_limit: data.usage_limit || null,
                    is_active: data.is_active !== undefined ? data.is_active : true,
                    createdAt: new Date(),
               })
               .returning();
          return newCoupon;
     } catch (error) {
          console.error('Failed to create coupon:', error);
          throw error;
     }
}

// Update an existing coupon code
export async function updateCoupon(
     id: string,
     data: {
          discount_type?: string;
          discount_value?: number;
          min_order_amount?: number | null;
          max_discount_amount?: number | null;
          expires_at?: Date | null;
          usage_limit?: number | null;
          is_active?: boolean;
     }
) {
     try {
          const updated = await db
               .update(coupons)
               .set(data)
               .where(eq(coupons.id, id))
               .returning();
          return updated[0];
     } catch (error) {
          console.error('Failed to update coupon:', error);
          throw error;
     }
}

// Delete a coupon code by ID
export async function deleteCoupon(id: string) {
     try {
          const deleted = await db
               .delete(coupons)
               .where(eq(coupons.id, id))
               .returning();
          return deleted[0];
     } catch (error) {
          console.error('Failed to delete coupon:', error);
          throw error;
     }
}
