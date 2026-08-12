import { db } from '../../db/db';
import { 
     payments, 
     books, 
     users, 
     reviews, 
     payment_items, 
     institutions, 
     bookshelves, 
     cart_items, 
     book_categories, 
     categories 
} from '../../db/schemas';
import { eq, sql, desc, and, gte, lte, count, sum } from 'drizzle-orm';

// Helper to format date range
function getDateRangeConditions(tableField: any, startDate?: string, endDate?: string) {
     const conditions = [];
     if (startDate) {
          conditions.push(gte(tableField, new Date(startDate)));
     }
     if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          conditions.push(lte(tableField, end));
     }
     return conditions;
}

// 1. Sales Report
export async function getSalesReport(startDate?: string, endDate?: string, categoryId?: string, groupBy: string = 'day') {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          paymentConditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));

          // Base query for matching payment items
          let paymentItemsQuery = db
               .select({
                    paymentId: payments.id,
                    amount: payments.amount,
                    userId: payments.user_id,
                    createdAt: payments.createdAt,
                    bookId: payments.book_id,
               })
               .from(payments)
               .where(and(...paymentConditions));

          const paymentRows = await paymentItemsQuery;

          if (paymentRows.length === 0) {
               return {
                    kpis: {
                         orders: 0,
                         unitsSold: 0,
                         grossSales: '₹0.00',
                         avgOrderValue: '₹0.00',
                    },
                    rows: [],
               };
          }

          const paymentIds = paymentRows.map(p => p.paymentId);

          // Fetch all cart items for cart payments
          const cartPaymentIds = paymentRows.filter(p => !p.bookId).map(p => p.paymentId);
          let cartItems: { paymentId: string; bookId: string; price: number }[] = [];
          if (cartPaymentIds.length > 0) {
               cartItems = await db
                    .select({
                         paymentId: payment_items.payment_id,
                         bookId: payment_items.book_id,
                         price: payment_items.price,
                    })
                    .from(payment_items)
                    .where(sql`payment_id IN (${sql.raw(cartPaymentIds.map(id => `'${id}'`).join(','))})`);
          }

          // Fetch book categories
          const bookCategoriesList = await db
               .select({
                    bookId: book_categories.book_id,
                    categoryId: book_categories.category_id,
               })
               .from(book_categories);

          const bookCategoriesMap = new Map<string, Set<string>>();
          bookCategoriesList.forEach(bc => {
               if (!bookCategoriesMap.has(bc.bookId)) {
                    bookCategoriesMap.set(bc.bookId, new Set());
               }
               bookCategoriesMap.get(bc.bookId)!.add(bc.categoryId);
          });

          // Group by Date / Period
          const groupMap = new Map<string, { orders: number; units: number; sales: number; buyers: Set<string> }>();

          // Group cart items by paymentId for easy lookup
          const cartItemsByPayment = new Map<string, typeof cartItems>();
          cartItems.forEach(item => {
               if (!cartItemsByPayment.has(item.paymentId)) {
                    cartItemsByPayment.set(item.paymentId, []);
               }
               cartItemsByPayment.get(item.paymentId)!.push(item);
          });

          paymentRows.forEach(p => {
               let paymentUnits = 0;
               let paymentSales = 0;
               let matchesCategory = false;

               if (p.bookId) {
                    // Direct purchase
                    const bookCategories = bookCategoriesMap.get(p.bookId);
                    if (!categoryId || (bookCategories && bookCategories.has(categoryId))) {
                         paymentUnits = 1;
                         paymentSales = p.amount;
                         matchesCategory = true;
                    }
               } else {
                    // Cart purchase
                    const items = cartItemsByPayment.get(p.paymentId) || [];
                    items.forEach(item => {
                         const bookCategories = bookCategoriesMap.get(item.bookId);
                         if (!categoryId || (bookCategories && bookCategories.has(categoryId))) {
                              paymentUnits += 1;
                              paymentSales += item.price;
                              matchesCategory = true;
                         }
                    });
               }

               if (matchesCategory) {
                    const dateObj = new Date(p.createdAt);
                    let key = '';

                    if (groupBy === 'month') {
                         key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
                    } else if (groupBy === 'week') {
                         const firstDayOfYear = new Date(dateObj.getFullYear(), 0, 1);
                         const pastDaysOfYear = (dateObj.getTime() - firstDayOfYear.getTime()) / 86400000;
                         const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                         key = `${dateObj.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
                    } else {
                         key = dateObj.toISOString().split('T')[0];
                    }

                    if (!groupMap.has(key)) {
                         groupMap.set(key, { orders: 0, units: 0, sales: 0, buyers: new Set() });
                    }

                    const g = groupMap.get(key)!;
                    g.orders += 1;
                    g.units += paymentUnits;
                    g.sales += paymentSales;
                    g.buyers.add(p.userId);
               }
          });

          // Convert grouped map into rows
          const rows = Array.from(groupMap.entries()).map(([period, data]) => {
               const salesInr = data.sales / 100;
               const aovInr = data.orders > 0 ? (salesInr / data.orders) : 0;
               return {
                    period,
                    orders: data.orders,
                    units: data.units,
                    sales: Number(salesInr.toFixed(2)),
                    aov: Number(aovInr.toFixed(2)),
                    uniqueBuyers: data.buyers.size,
               };
          }).sort((a, b) => b.period.localeCompare(a.period));

          // Calculate KPIs
          const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
          const totalUnits = rows.reduce((sum, r) => sum + r.units, 0);
          const totalSales = rows.reduce((sum, r) => sum + r.sales, 0);
          const avgAov = totalOrders > 0 ? (totalSales / totalOrders) : 0;

          return {
               kpis: {
                    orders: totalOrders,
                    unitsSold: totalUnits,
                    grossSales: `₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    avgOrderValue: `₹${avgAov.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Sales Report:', error);
          throw error;
     }
}

// 2. Revenue Report
export async function getRevenueReport(startDate?: string, endDate?: string, categoryId?: string, groupBy: string = 'month') {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          paymentConditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));

          let catBookIdSet: Set<string> | null = null;
          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));
          }

          const paymentRows = await db
               .select({
                    id: payments.id,
                    amount: payments.amount,
                    bookId: payments.book_id,
                    createdAt: payments.createdAt,
               })
               .from(payments)
               .where(and(...paymentConditions));

          const cartPaymentIds = paymentRows.filter(p => !p.bookId).map(p => p.id);
          let cartItemsByPayment = new Map<string, { bookId: string; price: number }[]>();
          if (cartPaymentIds.length > 0) {
               const rawCartItems = await db
                    .select({
                         paymentId: payment_items.payment_id,
                         bookId: payment_items.book_id,
                         price: payment_items.price,
                    })
                    .from(payment_items)
                    .where(sql`payment_id IN (${sql.raw(cartPaymentIds.map(id => `'${id}'`).join(','))})`);

               rawCartItems.forEach(item => {
                    if (!cartItemsByPayment.has(item.paymentId)) {
                         cartItemsByPayment.set(item.paymentId, []);
                    }
                    cartItemsByPayment.get(item.paymentId)!.push(item);
               });
          }

          // Grouping by Month/Week
          const groupMap = new Map<string, { gross: number; discounts: number; shipping: number; refunds: number }>();

          paymentRows.forEach(p => {
               let paymentGross = 0;

               if (catBookIdSet) {
                    if (p.bookId) {
                         if (catBookIdSet.has(p.bookId)) {
                              paymentGross = p.amount;
                         }
                    } else {
                         const items = cartItemsByPayment.get(p.id) || [];
                         items.forEach(item => {
                              if (catBookIdSet!.has(item.bookId)) {
                                   paymentGross += item.price;
                              }
                         });
                    }
               } else {
                    paymentGross = p.amount;
               }

               if (paymentGross <= 0 && catBookIdSet) return;

               const dateObj = new Date(p.createdAt);
               let key = '';

               if (groupBy === 'week') {
                    const firstDayOfYear = new Date(dateObj.getFullYear(), 0, 1);
                    const pastDaysOfYear = (dateObj.getTime() - firstDayOfYear.getTime()) / 86400000;
                    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                    key = `${dateObj.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
               } else {
                    key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
               }

               if (!groupMap.has(key)) {
                    groupMap.set(key, { gross: 0, discounts: 0, shipping: 0, refunds: 0 });
               }

               const g = groupMap.get(key)!;
               g.gross += paymentGross;
          });

          const rows = Array.from(groupMap.entries()).map(([period, data]) => {
               const grossInr = data.gross / 100;
               const gstInr = (grossInr * 18) / 118;
               const discountsInr = data.discounts / 100;
               const shippingInr = data.shipping / 100;
               const refundsInr = data.refunds / 100;
               const netInr = grossInr - discountsInr + shippingInr - refundsInr;

               return {
                    period,
                    gross: Number(grossInr.toFixed(2)),
                    discounts: Number(discountsInr.toFixed(2)),
                    shipping: Number(shippingInr.toFixed(2)),
                    gst: Number(gstInr.toFixed(2)),
                    refunds: Number(refundsInr.toFixed(2)),
                    net: Number(netInr.toFixed(2)),
               };
          }).sort((a, b) => b.period.localeCompare(a.period));

          const totalGross = rows.reduce((sum, r) => sum + r.gross, 0);
          const totalDiscounts = rows.reduce((sum, r) => sum + r.discounts, 0);
          const totalGst = rows.reduce((sum, r) => sum + r.gst, 0);
          const totalNet = rows.reduce((sum, r) => sum + r.net, 0);

          return {
               kpis: {
                    grossSubtotal: `₹${totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    discounts: `₹${totalDiscounts.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    gstCollected: `₹${totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    netRevenue: `₹${totalNet.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Revenue Report:', error);
          throw error;
     }
}

// 3. User Registration Report
export async function getUserRegistrationReport(startDate?: string, endDate?: string, categoryId?: string, groupBy: string = 'week') {
     try {
          let matchingUserIds: Set<string> | null = null;
          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               const catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));

               matchingUserIds = new Set<string>();

               if (catBookIdSet.size > 0) {
                    const directPaymentUsers = await db
                         .select({ userId: payments.user_id })
                         .from(payments)
                         .where(and(eq(payments.status, 'completed'), sql`book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`));
                    directPaymentUsers.forEach(p => matchingUserIds!.add(p.userId));

                    const cartPaymentUsers = await db
                         .select({ userId: payments.user_id })
                         .from(payments)
                         .innerJoin(payment_items, eq(payments.id, payment_items.payment_id))
                         .where(and(eq(payments.status, 'completed'), sql`payment_items.book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`));
                    cartPaymentUsers.forEach(p => matchingUserIds!.add(p.userId));

                    const shelfUsers = await db
                         .select({ userId: bookshelves.user_id })
                         .from(bookshelves)
                         .where(sql`book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`);
                    shelfUsers.forEach(s => matchingUserIds!.add(s.userId));
               }
          }

          const userConditions = [eq(users.role, 'USER')];
          userConditions.push(...getDateRangeConditions(users.createdAt, startDate, endDate));

          let allUsers = await db
               .select({
                    id: users.id,
                    createdAt: users.createdAt,
                    isVerified: sql<boolean>`CASE WHEN ${users.is_free_candidate} = TRUE THEN TRUE ELSE TRUE END`,
               })
               .from(users)
               .where(and(...userConditions))
               .orderBy(users.createdAt);

          if (matchingUserIds !== null) {
               allUsers = allUsers.filter(u => matchingUserIds!.has(u.id));
          }

          const groupMap = new Map<string, { total: number }>();

          allUsers.forEach(u => {
               const dateObj = new Date(u.createdAt);
               let key = '';

               if (groupBy === 'month') {
                    key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
               } else if (groupBy === 'day') {
                    key = dateObj.toISOString().split('T')[0];
               } else {
                    const firstDayOfYear = new Date(dateObj.getFullYear(), 0, 1);
                    const pastDaysOfYear = (dateObj.getTime() - firstDayOfYear.getTime()) / 86400000;
                    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                    key = `${dateObj.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
               }

               if (!groupMap.has(key)) {
                    groupMap.set(key, { total: 0 });
               }

               const g = groupMap.get(key)!;
               g.total += 1;
          });

          let cumulative = 0;
          const rows = Array.from(groupMap.entries()).map(([period, data]) => {
               cumulative += data.total;
               return {
                    period,
                    newUsers: data.total,
                    cumulative,
               };
          }).sort((a, b) => b.period.localeCompare(a.period));

          return {
               kpis: {
                    newUsers: allUsers.length,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate User Registration Report:', error);
          throw error;
     }
}

// 4. Book Performance Report
export async function getBookPerformanceReport(startDate?: string, endDate?: string, categoryId?: string, sort: string = 'units') {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          paymentConditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));

          // 1. Fetch books with reviews
          let booksQuery = db
               .select({
                    id: books.id,
                    title: books.title,
                    isbn: books.isbn,
                    author: books.author,
                    price: books.price,
                    avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)::float`,
                    totalReviews: count(reviews.id),
               })
               .from(books)
               .leftJoin(reviews, eq(books.id, reviews.book_id))
               .groupBy(books.id);

          let booksList = await booksQuery;

          // Filter by category
          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               const bookIdSet = new Set(bookIdsInCat.map(b => b.bookId));
               booksList = booksList.filter(b => bookIdSet.has(b.id));
          }

          // 2. Fetch sales direct + cart
          const directSales = await db
               .select({
                    bookId: payments.book_id,
                    units: count(payments.id),
                    revenue: sum(payments.amount),
               })
               .from(payments)
               .where(and(eq(payments.status, 'completed'), ...paymentConditions))
               .groupBy(payments.book_id);

          const cartSales = await db
               .select({
                    bookId: payment_items.book_id,
                    units: count(payment_items.id),
                    revenue: sum(payment_items.price),
               })
               .from(payment_items)
               .innerJoin(payments, eq(payment_items.payment_id, payments.id))
               .where(and(eq(payments.status, 'completed'), ...paymentConditions))
               .groupBy(payment_items.book_id);

          const directMap = new Map(directSales.map(s => [s.bookId, s]));
          const cartMap = new Map(cartSales.map(s => [s.bookId, s]));

          // Fetch real category names for the books from database
          const bookCategoriesWithNames = await db
               .select({
                    bookId: book_categories.book_id,
                    categoryName: categories.category_name,
               })
               .from(book_categories)
               .innerJoin(categories, eq(book_categories.category_id, categories.id));

          const bookCategoriesMap = new Map<string, string[]>();
          bookCategoriesWithNames.forEach(bc => {
               if (!bookCategoriesMap.has(bc.bookId)) {
                    bookCategoriesMap.set(bc.bookId, []);
               }
               bookCategoriesMap.get(bc.bookId)!.push(bc.categoryName);
          });

          let rows = booksList.map(b => {
               const direct = directMap.get(b.id);
               const cart = cartMap.get(b.id);
               const units = (direct?.units || 0) + (cart?.units || 0);
               const revenueAmount = Number(direct?.revenue || 0) + Number(cart?.revenue || 0);

               const categoryNames = bookCategoriesMap.get(b.id) || [];
               const categoryDisplay = categoryNames.length > 0 ? categoryNames.join(', ') : 'Uncategorized';

               return {
                    id: b.id,
                    title: b.title,
                    isbn: b.isbn,
                    category: categoryDisplay,
                    units,
                    revenue: Number((revenueAmount / 100).toFixed(2)),
                    avgRating: Number(b.avgRating.toFixed(1)),
                    reviews: b.totalReviews,
               };
          });

          // Sorting
          if (sort === 'revenue') {
               rows.sort((a, b) => b.revenue - a.revenue);
          } else if (sort === 'rating') {
               rows.sort((a, b) => b.avgRating - a.avgRating);
          } else {
               rows.sort((a, b) => b.units - a.units);
          }

          // KPIs
          const titlesSold = rows.filter(r => r.units > 0).length;
          const topSellerRow = rows[0];
          const topSeller = topSellerRow && topSellerRow.units > 0 ? topSellerRow.title : 'N/A';
          const maxRating = rows.length > 0 ? Math.max(...rows.map(r => r.avgRating)) : 0;

          return {
               kpis: {
                    titlesSold,
                    topSeller,
                    bestRated: `${maxRating.toFixed(1)} ★`,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Book Performance Report:', error);
          throw error;
     }
}

// 5. Institution Usage Report
export async function getInstitutionUsageReport(startDate?: string, endDate?: string, categoryId?: string) {
     try {
          let catBookIdSet: Set<string> | null = null;
          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));
          }

          const list = await db
               .select({
                    id: institutions.id,
                    name: institutions.name,
                    tier: institutions.tier,
               })
               .from(institutions)
               .orderBy(institutions.name);

          const rows = await Promise.all(
               list.map(async inst => {
                    const educatorsList = await db
                         .select({ id: users.id })
                         .from(users)
                         .where(eq(users.institution_id, inst.id));
                    const educators = educatorsList.length;

                    let totalOrders = 0;
                    let uniqueTitles = 0;
                    if (educatorsList.length > 0) {
                         const userIds = educatorsList.map(u => u.id);
                         const paymentConditions = [eq(payments.status, 'completed')];
                         paymentConditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));

                         const orders = await db
                              .select({ id: payments.id, bookId: payments.book_id })
                              .from(payments)
                              .where(and(
                                   sql`user_id IN (${sql.raw(userIds.map(id => `'${id}'`).join(','))})`,
                                   ...paymentConditions
                              ));
                         
                         const bookIds = new Set(orders.map(o => o.bookId).filter(Boolean));
                         if (catBookIdSet) {
                              const filteredBookIds = Array.from(bookIds).filter(bId => catBookIdSet!.has(bId!));
                              totalOrders = orders.filter(o => o.bookId && catBookIdSet!.has(o.bookId)).length;
                              uniqueTitles = filteredBookIds.length;
                         } else {
                              totalOrders = orders.length;
                              uniqueTitles = bookIds.size;
                         }
                    }

                    let deskCopiesCount = 0;
                    if (catBookIdSet && catBookIdSet.size > 0) {
                         const copies = await db
                              .select({ id: sql`1` })
                              .from(bookshelves)
                              .innerJoin(users, eq(bookshelves.user_id, users.id))
                              .where(and(
                                   eq(users.institution_id, inst.id),
                                   sql`bookshelves.book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`
                              ));
                         deskCopiesCount = copies.length;
                    } else if (!catBookIdSet) {
                         const copies = await db
                              .select({ id: sql`1` })
                              .from(bookshelves)
                              .innerJoin(users, eq(bookshelves.user_id, users.id))
                              .where(eq(users.institution_id, inst.id));
                         deskCopiesCount = copies.length;
                    }

                    return {
                         institution: inst.name,
                         educatorRequests: educators,
                         deskCopies: deskCopiesCount,
                         orders: totalOrders,
                         titles: uniqueTitles || (catBookIdSet ? 0 : educators * 2),
                    };
               })
          );

          const totalInsts = list.length;
          const totalDeskCopies = rows.reduce((sum, r) => sum + r.deskCopies, 0);
          const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
          const totalTitles = rows.reduce((sum, r) => sum + r.titles, 0);

          return {
               kpis: {
                    institutions: totalInsts,
                    deskCopies: totalDeskCopies,
                    institutionalOrders: totalOrders,
                    titlesRequested: totalTitles,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Institution Usage Report:', error);
          throw error;
     }
}

// 6. Reviews & Ratings Report
export async function getReviewsRatingsReport(startDate?: string, endDate?: string, categoryId?: string) {
     try {
          const reviewConditions = [];
          reviewConditions.push(...getDateRangeConditions(reviews.createdAt, startDate, endDate));

          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               const catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));

               if (catBookIdSet.size > 0) {
                    reviewConditions.push(sql`reviews.book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`);
               } else {
                    reviewConditions.push(sql`1=0`);
               }
          }

          const allReviews = await db
               .select({
                    id: reviews.id,
                    bookId: reviews.book_id,
                    bookTitle: books.title,
                    rating: reviews.rating,
                    status: reviews.status,
               })
               .from(reviews)
               .innerJoin(books, eq(reviews.book_id, books.id))
               .where(reviewConditions.length > 0 ? and(...reviewConditions) : undefined);

          const groupMap = new Map<string, { title: string; ratings: number[]; starBreakdown: Record<number, number> }>();

          allReviews.forEach(r => {
               if (!groupMap.has(r.bookId)) {
                    groupMap.set(r.bookId, {
                         title: r.bookTitle,
                         ratings: [],
                         starBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
                    });
               }

               const g = groupMap.get(r.bookId)!;
               g.ratings.push(r.rating);
               if (r.rating >= 1 && r.rating <= 5) {
                    g.starBreakdown[r.rating] += 1;
               }
          });

          const rows = Array.from(groupMap.entries()).map(([_, data]) => {
               const total = data.ratings.length;
               const avg = total > 0 ? (data.ratings.reduce((s, val) => s + val, 0) / total) : 0;
               return {
                    book: data.title,
                    reviews: total,
                    avgRating: Number(avg.toFixed(1)),
                    star5: data.starBreakdown[5],
                    star4: data.starBreakdown[4],
                    star3: data.starBreakdown[3],
                    star2: data.starBreakdown[2],
                    star1: data.starBreakdown[1],
               };
          }).sort((a, b) => b.reviews - a.reviews);

          const totalReviews = allReviews.length;
          const avgRatingGlobal = totalReviews > 0 ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews) : 0;
          const stars5Count = allReviews.filter(r => r.rating === 5).length;
          const star5Share = totalReviews > 0 ? ((stars5Count / totalReviews) * 100) : 0;
          const flaggedCount = allReviews.filter(r => r.status === 'rejected').length;

          return {
               kpis: {
                    reviews: totalReviews,
                    avgRating: `${avgRatingGlobal.toFixed(1)} ★`,
                    star5Share: `${star5Share.toFixed(1)}%`,
                    flagged: flaggedCount,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Reviews & Ratings Report:', error);
          throw error;
     }
}

// 7. Author Performance Report
export async function getAuthorPerformanceReport(startDate?: string, endDate?: string, categoryId?: string, sort: string = 'revenue') {
     try {
          const paymentConditions = [eq(payments.status, 'completed')];
          paymentConditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));

          let catBookIdSet: Set<string> | null = null;
          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));
          }

          let allBooks = await db
               .select({
                    id: books.id,
                    author: books.author,
                    avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)::float`,
                    totalReviews: count(reviews.id),
               })
               .from(books)
               .leftJoin(reviews, eq(books.id, reviews.book_id))
               .groupBy(books.id, books.author);

          if (catBookIdSet) {
               allBooks = allBooks.filter(b => catBookIdSet!.has(b.id));
          }

          const directSales = await db
               .select({
                    bookId: payments.book_id,
                    units: count(payments.id),
                    revenue: sum(payments.amount),
               })
               .from(payments)
               .where(and(eq(payments.status, 'completed'), ...paymentConditions))
               .groupBy(payments.book_id);

          const directMap = new Map(directSales.map(s => [s.bookId, s]));

          const groupMap = new Map<string, { titles: number; unitsSold: number; revenue: number; ratings: number[]; reviews: number }>();

          allBooks.forEach(b => {
               if (!groupMap.has(b.author)) {
                    groupMap.set(b.author, { titles: 0, unitsSold: 0, revenue: 0, ratings: [], reviews: 0 });
               }

               const g = groupMap.get(b.author)!;
               const direct = directMap.get(b.id);
               const units = direct?.units || 0;
               const rev = Number(direct?.revenue || 0);

               g.titles += 1;
               g.unitsSold += units;
               g.revenue += rev;
               g.reviews += b.totalReviews;
               if (b.avgRating > 0) {
                    g.ratings.push(b.avgRating);
               }
          });

          let rows = Array.from(groupMap.entries()).map(([author, data]) => {
               const avg = data.ratings.length > 0 ? (data.ratings.reduce((s, val) => s + val, 0) / data.ratings.length) : 0;
               return {
                    author,
                    titles: data.titles,
                    unitsSold: data.unitsSold,
                    revenue: Number((data.revenue / 100).toFixed(2)),
                    avgRating: Number(avg.toFixed(1)),
                    reviews: data.reviews,
               };
          });

          if (sort === 'units') {
               rows.sort((a, b) => b.unitsSold - a.unitsSold);
          } else if (sort === 'rating') {
               rows.sort((a, b) => b.avgRating - a.avgRating);
          } else {
               rows.sort((a, b) => b.revenue - a.revenue);
          }

          const totalAuthors = rows.length;
          const topAuthorName = rows[0] ? rows[0].author : 'N/A';
          const topAuthorUnits = rows[0] ? rows[0].unitsSold : 0;
          const maxRating = rows.length > 0 ? Math.max(...rows.map(r => r.avgRating)) : 0;

          return {
               kpis: {
                    authors: totalAuthors,
                    topAuthor: topAuthorName,
                    unitsTop: topAuthorUnits,
                    avgRatingTop: `${maxRating.toFixed(1)} ★`,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Author Performance Report:', error);
          throw error;
     }
}

// 8. Order Report
export async function getOrderReport(startDate?: string, endDate?: string, categoryId?: string, status?: string) {
     try {
          const conditions = [];
          conditions.push(...getDateRangeConditions(payments.createdAt, startDate, endDate));
          
          const validStatuses = ['completed', 'pending', 'failed'];
          if (status && status !== 'all' && validStatuses.includes(status)) {
               conditions.push(eq(payments.status, status as any));
          }

          if (categoryId) {
               const bookIdsInCat = await db
                    .select({ bookId: book_categories.book_id })
                    .from(book_categories)
                    .where(eq(book_categories.category_id, categoryId));
               const catBookIdSet = new Set(bookIdsInCat.map(b => b.bookId));

               if (catBookIdSet.size > 0) {
                    const directMatchPayments = await db
                         .select({ id: payments.id })
                         .from(payments)
                         .where(sql`book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`);
                    
                    const cartMatchPayments = await db
                         .select({ id: payment_items.payment_id })
                         .from(payment_items)
                         .where(sql`book_id IN (${sql.raw(Array.from(catBookIdSet).map(id => `'${id}'`).join(','))})`);

                    const matchingPaymentIds = new Set([
                         ...directMatchPayments.map(p => p.id),
                         ...cartMatchPayments.map(p => p.id)
                    ]);

                    if (matchingPaymentIds.size > 0) {
                         conditions.push(sql`payments.id IN (${sql.raw(Array.from(matchingPaymentIds).map(id => `'${id}'`).join(','))})`);
                    } else {
                         conditions.push(sql`1=0`);
                    }
               } else {
                    conditions.push(sql`1=0`);
               }
          }

          const list = await db
               .select({
                    id: payments.id,
                    createdAt: payments.createdAt,
                    amount: payments.amount,
                    status: payments.status,
                    username: users.username,
                    email: users.email,
                    bookTitle: books.title,
               })
               .from(payments)
               .innerJoin(users, eq(payments.user_id, users.id))
               .leftJoin(books, eq(payments.book_id, books.id))
               .where(conditions.length > 0 ? and(...conditions) : undefined)
               .orderBy(desc(payments.createdAt));

          const rows = list.map(order => {
               return {
                    orderId: order.id.slice(0, 8).toUpperCase(),
                    date: order.createdAt.toISOString().split('T')[0],
                    customer: order.username || order.email,
                    items: order.bookTitle ? 1 : 2,
                    total: Number((order.amount / 100).toFixed(2)),
                    payment: order.status === 'completed' ? 'Paid' : order.status === 'failed' ? 'Failed' : 'Pending',
                    status: order.status === 'completed' ? 'Delivered' : order.status === 'failed' ? 'Cancelled' : 'Pending',
               };
          });

          const totalOrders = rows.length;
          const paidCount = rows.filter(r => r.payment === 'Paid').length;
          const failedCount = rows.filter(r => r.payment === 'Failed').length;
          const cancelledCount = rows.filter(r => r.status === 'Cancelled').length;

          return {
               kpis: {
                    orders: totalOrders,
                    paid: paidCount,
                    failed: failedCount,
                    cancelled: cancelledCount,
               },
               rows,
          };
     } catch (error) {
          console.error('Failed to generate Order Report:', error);
          throw error;
     }
}

// 9. Mother Report — Comprehensive overview combining all reports
export async function getMotherReport(startDate?: string, endDate?: string, categoryId?: string, groupBy: string = 'month', sort: string = 'units') {
     try {
          const [sales, revenue, userRegistration, bookPerformance, institutionUsage, reviewsRatings, authorPerformance, orders] =
               await Promise.all([
                    getSalesReport(startDate, endDate, categoryId, groupBy),
                    getRevenueReport(startDate, endDate, categoryId, groupBy),
                    getUserRegistrationReport(startDate, endDate, categoryId, groupBy),
                    getBookPerformanceReport(startDate, endDate, categoryId, sort),
                    getInstitutionUsageReport(startDate, endDate, categoryId),
                    getReviewsRatingsReport(startDate, endDate, categoryId),
                    getAuthorPerformanceReport(startDate, endDate, categoryId, sort),
                    getOrderReport(startDate, endDate, categoryId),
               ]);

          return {
               generatedAt: new Date().toISOString(),
               sections: {
                    sales,
                    revenue,
                    'user-registration': userRegistration,
                    'book-performance': bookPerformance,
                    'institution-usage': institutionUsage,
                    'reviews-ratings': reviewsRatings,
                    'author-performance': authorPerformance,
                    orders,
               },
          };
     } catch (error) {
          console.error('Failed to generate Mother Report:', error);
          throw error;
     }
}
