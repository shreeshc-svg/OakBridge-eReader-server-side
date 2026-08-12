import { Request, Response } from 'express';
import * as superadminService from './superadmin.service';
import * as reportsService from './reports.service';
import { sendWelcomeMail, send_contact_notification_mail } from '../../utils/mail.service';

export async function getRevenueAnalytics(req: Request, res: Response): Promise<any> {
     try {
          const metrics = await superadminService.getRevenueMetrics();
          return res.status(200).json({
               success: true,
               data: metrics,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve revenue analytics',
          });
     }
}

export async function getActivityLogs(req: Request, res: Response): Promise<any> {
     try {
          const page = parseInt(req.query.page as string) || 1;
          const limit = parseInt(req.query.limit as string) || 10;
          const timeframe = (req.query.timeframe as string) || 'all';

          const logsData = await superadminService.getUserLogs(page, limit, timeframe);
          return res.status(200).json({
               success: true,
               data: logsData,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve activity logs',
          });
     }
}

export async function exportOrdersReport(req: Request, res: Response): Promise<any> {
     try {
          const report = await superadminService.getOrdersReport();

          // Construct CSV content
          const csvHeaders = 'Order No,Buyer Account,Timestamp of Purchase,Name of the Buyer,Book(s) Purchased,Shipping Address,Amount (INR),Status\n';
          const csvRows = report
               .map((order) => {
                    const orderNo = order.orderId || '';
                    const buyerAccount = order.buyerEmail || '';
                    const timestamp = order.timestamp ? new Date(order.timestamp).toISOString() : '';
                    const buyerName = order.buyerName || '';
                    
                    const bookName = order.bookName 
                         ? `"${order.bookName.replace(/"/g, '""').replace(/\n/g, ' ')}"`
                         : 'N/A';

                    // Sanitize shipping address to avoid breaking CSV format
                    const address = order.shippingAddress 
                         ? `"${order.shippingAddress.replace(/"/g, '""').replace(/\n/g, ' ')}"`
                         : 'N/A';

                    const amountInInr = order.amount ? (order.amount / 100).toFixed(2) : '0.00';
                    const status = order.status || '';

                    return `${orderNo},${buyerAccount},${timestamp},${buyerName},${bookName},${address},${amountInInr},${status}`;
               })
               .join('\n');

          const csvContent = csvHeaders + csvRows;

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename=orders_report.csv');
          return res.status(200).send(csvContent);
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to export orders report',
          });
     }
}

export async function exportReport(req: Request, res: Response): Promise<any> {
     try {
          const type = (req.query.type as string) || 'sales';
          const startDate = req.query.startDate as string;
          const endDate = req.query.endDate as string;

          let reportData: any[] = [];
          let csvHeaders = '';
          let filename = 'report.csv';

          const escapeCsv = (val: any) => {
               if (val === null || val === undefined) return '';
               const str = String(val);
               if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
               }
               return str;
          };

          if (type === 'sales') {
               reportData = await superadminService.getSalesReport(startDate, endDate);
               csvHeaders = 'Date,Total Orders,Gross Revenue (INR),Average Order Value (AOV),Unique Buyers\n';
               filename = `sales_report_${Date.now()}.csv`;
          } else if (type === 'books') {
               reportData = await superadminService.getBookPerformanceReport(startDate, endDate);
               csvHeaders = 'Book Title,Author,Price (INR),Units Sold,Total Revenue (INR),Average Rating,Total Reviews,Favorites Shelf Additions,Reading Queue Additions,Active Cart Additions\n';
               filename = `book_performance_report_${Date.now()}.csv`;
          } else if (type === 'customers') {
               reportData = await superadminService.getCustomerPurchaseReport(startDate, endDate);
               csvHeaders = 'Customer Username,Email,Registration Date,Total Orders,Total Spend (INR),Last Purchase Date\n';
               filename = `customer_purchase_report_${Date.now()}.csv`;
          } else if (type === 'reviews') {
               reportData = await superadminService.getReviewsReport(startDate, endDate);
               csvHeaders = 'Book Title,Reviewer Email,Rating,Review Text,Status,Date\n';
               filename = `reviews_report_${Date.now()}.csv`;
          } else if (type === 'logs') {
               reportData = await superadminService.getAdminAuditReport(startDate, endDate);
               csvHeaders = 'Timestamp,User Email,User Name,Action Type,Meta Details,IP Address\n';
               filename = `admin_audit_report_${Date.now()}.csv`;
          } else {
               return res.status(400).json({
                    success: false,
                    message: 'Invalid report type specified',
               });
          }

          let csvRows = '';
          if (type === 'sales') {
               csvRows = reportData.map(r => 
                    `${escapeCsv(r.date)},${escapeCsv(r.totalOrders)},${escapeCsv(r.revenueInr)},${escapeCsv(r.aovInr)},${escapeCsv(r.uniqueBuyers)}`
               ).join('\n');
          } else if (type === 'books') {
               csvRows = reportData.map(r => 
                    `${escapeCsv(r.title)},${escapeCsv(r.author)},${escapeCsv(r.priceInr)},${escapeCsv(r.unitsSold)},${escapeCsv(r.revenueInr)},${escapeCsv(r.avgRating)},${escapeCsv(r.totalReviews)},${escapeCsv(r.favoritesCount)},${escapeCsv(r.readingQueueCount)},${escapeCsv(r.cartAddsCount)}`
               ).join('\n');
          } else if (type === 'customers') {
               csvRows = reportData.map(r => 
                    `${escapeCsv(r.username)},${escapeCsv(r.email)},${escapeCsv(r.registrationDate)},${escapeCsv(r.totalOrders)},${escapeCsv(r.totalSpendInr)},${escapeCsv(r.lastPurchase)}`
               ).join('\n');
          } else if (type === 'reviews') {
               csvRows = reportData.map(r => 
                    `${escapeCsv(r.bookTitle)},${escapeCsv(r.reviewerEmail)},${escapeCsv(r.rating)},${escapeCsv(r.reviewText)},${escapeCsv(r.status)},${escapeCsv(r.createdAt)}`
               ).join('\n');
          } else if (type === 'logs') {
               csvRows = reportData.map(r => {
                    const detailsStr = typeof r.details === 'object' ? JSON.stringify(r.details) : String(r.details);
                    return `${escapeCsv(r.createdAt)},${escapeCsv(r.email)},${escapeCsv(r.userName)},${escapeCsv(r.action)},${escapeCsv(detailsStr)},${escapeCsv(r.ipAddress)}`;
               }).join('\n');
          }

          const csvContent = csvHeaders + csvRows;

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
          return res.status(200).send(csvContent);
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to export report',
          });
     }
}

export async function getSubscriptionPlans(req: Request, res: Response): Promise<any> {
     try {
          const plans = await superadminService.getSubscriptionPlans();
          return res.status(200).json({
               success: true,
               data: plans,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve subscription plans',
          });
     }
}

export async function getActiveSubscriptionPlans(req: Request, res: Response): Promise<any> {
     try {
          const plans = await superadminService.getActiveSubscriptionPlans();
          return res.status(200).json({
               success: true,
               data: plans,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve active subscription plans',
          });
     }
}

export async function createSubscriptionPlan(req: Request, res: Response): Promise<any> {
     try {
          const { tier, name, price, memberLimit, durationMonths, features, isBestValue, isActive } = req.body;
          if (!tier || !name || price === undefined || memberLimit === undefined || !features) {
               return res.status(400).json({
                    success: false,
                    message: 'Missing required subscription plan fields',
               });
          }
          const plan = await superadminService.createSubscriptionPlan({
               tier,
               name,
               price,
               memberLimit,
               durationMonths: durationMonths !== undefined ? Number(durationMonths) : undefined,
               features,
               isBestValue,
               isActive,
          });
          return res.status(201).json({
               success: true,
               data: plan,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to create subscription plan',
          });
     }
}

export async function updateSubscriptionPlan(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          const updateData = { ...req.body };
          if (updateData.durationMonths !== undefined) {
               updateData.durationMonths = Number(updateData.durationMonths);
          }
          const plan = await superadminService.updateSubscriptionPlan(id, updateData);
          return res.status(200).json({
               success: true,
               data: plan,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update subscription plan',
          });
     }
}

export async function deleteSubscriptionPlan(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          const plan = await superadminService.deleteSubscriptionPlan(id);
          return res.status(200).json({
               success: true,
               data: plan,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to delete subscription plan',
          });
     }
}

export async function getInstitutions(req: Request, res: Response): Promise<any> {
     try {
          const institutionsData = await superadminService.getRegisteredInstitutions();
          return res.status(200).json({
               success: true,
               data: institutionsData,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve institutions',
          });
     }
}

export async function deleteInstitution(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          if (!id) {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID is required',
               });
          }
          await superadminService.deleteInstitution(id);
          return res.status(200).json({
               success: true,
               message: 'Institution deleted successfully',
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to delete institution',
          });
     }
}

export async function updateInstitution(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          if (!id) {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID is required',
               });
          }
          const { adminEmail, subscription_expires_at } = req.body;
          const updated = await superadminService.updateInstitution(id, {
               adminEmail,
               subscription_expires_at,
          });
          return res.status(200).json({
               success: true,
               data: updated,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update institution',
          });
     }
}

export async function getInstitutionAllowedCategories(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          if (!id) {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID is required',
               });
          }
          const allowedCats = await superadminService.getInstitutionAllowedCategories(id);
          return res.status(200).json({
               success: true,
               data: allowedCats,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve institution allowed categories',
          });
     }
}

export async function updateInstitutionAllowedCategories(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          const { categoriesList, categoryIds } = req.body;
          
          let listToSave: { categoryId: string; allowAllBooks: boolean }[] = [];
          
          if (Array.isArray(categoriesList)) {
               listToSave = categoriesList;
          } else if (Array.isArray(categoryIds)) {
               listToSave = categoryIds.map((catId: string) => ({ categoryId: catId, allowAllBooks: true }));
          } else {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID and categoriesList or categoryIds array are required',
               });
          }

          await superadminService.updateInstitutionAllowedCategories(id, listToSave);
          return res.status(200).json({
               success: true,
               message: 'Institution allowed categories updated successfully',
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update institution allowed categories',
          });
     }
}

export async function getInstitutionAllowedBooks(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          if (!id) {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID is required',
               });
          }
          const allowedBooks = await superadminService.getInstitutionAllowedBooks(id);
          return res.status(200).json({
               success: true,
               data: allowedBooks.map(b => b.bookId),
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve institution allowed books',
          });
     }
}

export async function updateInstitutionAllowedBooks(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          const { bookIds } = req.body;
          if (!id || !Array.isArray(bookIds)) {
               return res.status(400).json({
                    success: false,
                    message: 'Institution ID and bookIds array are required',
               });
          }
          await superadminService.updateInstitutionAllowedBooks(id, bookIds);
          return res.status(200).json({
               success: true,
               message: 'Institution allowed books updated successfully',
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update institution allowed books',
          });
     }
}

export async function createFreeCandidate(req: Request, res: Response): Promise<any> {
     try {
          const { username, email, password } = req.body;
          if (!username || !email || !password) {
               return res.status(400).json({
                    success: false,
                    message: 'Username, email and password are required',
               });
          }

          const newUser = await superadminService.createFreeCandidate({
               username,
               email,
               passwordStr: password,
          });

          // Send welcome email asynchronously
          sendWelcomeMail(newUser.email, newUser.username || 'Reader').catch((mailErr) => {
               console.error('SMTP: Failed to send welcome email to free candidate user:', mailErr);
          });

          return res.status(201).json({
               success: true,
               message: 'Free candidate created successfully',
               data: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
               },
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to create free candidate',
          });
     }
}

export async function getFreeCandidates(req: Request, res: Response): Promise<any> {
     try {
          const candidates = await superadminService.getFreeCandidates();
          return res.status(200).json({
               success: true,
               data: candidates,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve free candidates',
          });
     }
}

export async function getFreeCandidateAllowedBooks(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          if (!id) {
               return res.status(400).json({
                    success: false,
                    message: 'Candidate User ID is required',
               });
          }
          const allowedBookIds = await superadminService.getFreeCandidateAllowedBooks(id);
          return res.status(200).json({
               success: true,
               data: allowedBookIds,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve allowed books',
          });
     }
}

export async function updateFreeCandidateAllowedBooks(req: Request, res: Response): Promise<any> {
     try {
          const id = req.params.id as string;
          const { bookIds } = req.body;
          if (!id || !Array.isArray(bookIds)) {
               return res.status(400).json({
                    success: false,
                    message: 'Candidate User ID and bookIds array are required',
               });
          }
          await superadminService.updateFreeCandidateAllowedBooks(id, bookIds);
          return res.status(200).json({
               success: true,
               message: 'Free candidate allowed books updated successfully',
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update allowed books',
          });
     }
}

export async function getReportData(req: Request, res: Response): Promise<any> {
     try {
          const type = (req.query.type as string) || 'sales';
          const startDate = req.query.startDate as string;
          const endDate = req.query.endDate as string;
          const groupBy = req.query.groupBy as string;
          const categoryId = req.query.category as string;
          const sort = req.query.sort as string;

          let result;
          if (type === 'sales') {
               result = await reportsService.getSalesReport(startDate, endDate, categoryId, groupBy);
          } else if (type === 'revenue') {
               result = await reportsService.getRevenueReport(startDate, endDate, categoryId, groupBy);
          } else if (type === 'user-registration') {
               result = await reportsService.getUserRegistrationReport(startDate, endDate, categoryId, groupBy);
          } else if (type === 'book-performance') {
               result = await reportsService.getBookPerformanceReport(startDate, endDate, categoryId, sort);
          } else if (type === 'institution-usage') {
               result = await reportsService.getInstitutionUsageReport(startDate, endDate, categoryId);
          } else if (type === 'reviews-ratings') {
               result = await reportsService.getReviewsRatingsReport(startDate, endDate, categoryId);
          } else if (type === 'author-performance') {
               result = await reportsService.getAuthorPerformanceReport(startDate, endDate, categoryId, sort);
          } else if (type === 'orders') {
               result = await reportsService.getOrderReport(startDate, endDate, categoryId, sort);
          } else if (type === 'mother') {
               result = await reportsService.getMotherReport(startDate, endDate, categoryId, groupBy, sort);
          } else {
               return res.status(400).json({
                    success: false,
                    message: 'Invalid report type specified',
               });
          }

          return res.status(200).json({
               success: true,
               data: result,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve report data',
          });
     }
}

// Controller action to handle submission of contact messages from the public form
export async function createContactMessage(req: Request, res: Response): Promise<any> {
     try {
          const { name, email, subject, message } = req.body;
          if (!name || !email || !message) {
               return res.status(400).json({
                    success: false,
                    message: 'Name, email, and message are required fields.'
               });
          }

          const newMessage = await superadminService.saveContactMessage(name, email, subject, message);

          // Dispatch email notification to info@oakbridge.in asynchronously
          send_contact_notification_mail(name, email, subject, message).catch((err: any) => {
               console.error('Failed to send contact notification email:', err);
          });

          return res.status(201).json({
               success: true,
               message: 'Contact message saved successfully.',
               data: newMessage
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to save contact message.'
          });
     }
}

// Controller action to retrieve all contact messages for the superadmin dashboard
export async function getContactMessages(req: Request, res: Response): Promise<any> {
     try {
          const messages = await superadminService.getContactMessages();
          return res.status(200).json({
               success: true,
               data: messages
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve contact messages.'
          });
     }
}

// Controller action to delete a contact message by ID
export async function deleteContactMessage(req: Request, res: Response): Promise<any> {
     try {
          const { id } = req.params;
          await superadminService.deleteContactMessage(id as string);
          return res.status(200).json({
               success: true,
               message: 'Contact message deleted successfully.'
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to delete contact message.'
          });
     }
}

// Controller action to retrieve all coupons
export async function getCoupons(req: Request, res: Response): Promise<any> {
     try {
          const list = await superadminService.getCoupons();
          return res.status(200).json({
               success: true,
               data: list,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to retrieve coupons.',
          });
     }
}

// Controller action to create a new coupon
export async function createCoupon(req: Request, res: Response): Promise<any> {
     try {
          const {
               code,
               discount_type,
               discount_value,
               min_order_amount,
               max_discount_amount,
               expires_at,
               usage_limit,
               is_active,
          } = req.body;

          if (!code || !discount_type || discount_value === undefined) {
               return res.status(400).json({
                    success: false,
                    message: 'Code, discount_type, and discount_value are required.',
               });
          }

          const parsedExpiresAt = expires_at ? new Date(expires_at) : null;

          const coupon = await superadminService.createCoupon({
               code,
               discount_type,
               discount_value: Number(discount_value),
               min_order_amount: min_order_amount ? Number(min_order_amount) : null,
               max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
               expires_at: parsedExpiresAt,
               usage_limit: usage_limit ? Number(usage_limit) : null,
               is_active,
          });

          return res.status(201).json({
               success: true,
               message: 'Coupon created successfully.',
               data: coupon,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to create coupon.',
          });
     }
}

// Controller action to update an existing coupon
export async function updateCoupon(req: Request, res: Response): Promise<any> {
     try {
          const { id } = req.params;
          const {
               discount_type,
               discount_value,
               min_order_amount,
               max_discount_amount,
               expires_at,
               usage_limit,
               is_active,
          } = req.body;

          const parsedExpiresAt = expires_at ? new Date(expires_at) : undefined;

          const updated = await superadminService.updateCoupon(id as string, {
               discount_type,
               discount_value: discount_value !== undefined ? Number(discount_value) : undefined,
               min_order_amount: min_order_amount !== undefined ? (min_order_amount ? Number(min_order_amount) : null) : undefined,
               max_discount_amount: max_discount_amount !== undefined ? (max_discount_amount ? Number(max_discount_amount) : null) : undefined,
               expires_at: parsedExpiresAt,
               usage_limit: usage_limit !== undefined ? (usage_limit ? Number(usage_limit) : null) : undefined,
               is_active,
          });

          return res.status(200).json({
               success: true,
               message: 'Coupon updated successfully.',
               data: updated,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to update coupon.',
          });
     }
}

// Controller action to delete a coupon
export async function deleteCoupon(req: Request, res: Response): Promise<any> {
     try {
          const { id } = req.params;
          const deleted = await superadminService.deleteCoupon(id as string);
          return res.status(200).json({
               success: true,
               message: 'Coupon deleted successfully.',
               data: deleted,
          });
     } catch (error: any) {
          return res.status(500).json({
               success: false,
               message: error.message || 'Failed to delete coupon.',
          });
     }
}
