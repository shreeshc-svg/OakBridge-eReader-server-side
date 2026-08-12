import PDFDocument from 'pdfkit';
import { Buffer } from 'buffer';
import path from 'path';
import fs from 'fs';

export interface InvoiceItem {
     title: string;
     author?: string;
     isbn?: string;
     price: number; // in cents/paise
}

export interface InvoiceData {
     invoiceNo: string;
     date: string;
     orderNo: string;
     paymentRef: string;
     buyerName: string;
     shippingAddress?: string;
     billingAddress?: string;
     items: InvoiceItem[];
     totalAmount: number; // in cents/paise
     tier?: string;
}

function numberToWords(num: number): string {
     if (num === 0) return 'Zero';
     const a = [
          '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
          'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
     ];
     const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

     const g = (n: number): string => {
          if (n < 20) return a[n];
          const digit = n % 10;
          return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
     };

     const h = (n: number): string => {
          if (n < 100) return g(n);
          const rem = n % 100;
          return a[Math.floor(n / 100)] + ' Hundred' + (rem ? ' ' + g(rem) : '');
     };

     const k = (n: number): string => {
          let str = '';
          if (n >= 10000000) {
               str += h(Math.floor(n / 10000000)) + ' Crore ';
               n %= 10000000;
          }
          if (n >= 100000) {
               str += h(Math.floor(n / 100000)) + ' Lakh ';
               n %= 100000;
          }
          if (n >= 1000) {
               str += h(Math.floor(n / 1000)) + ' Thousand ';
               n %= 1000;
          }
          if (n > 0) {
               str += h(n);
          }
          return str.trim();
     };

     return k(num);
}

export const generateInvoicePDF = (data: InvoiceData): Promise<Buffer> => {
     return new Promise((resolve, reject) => {
          try {
               const doc = new PDFDocument({ margin: 30, size: 'A4' });
               const buffers: Buffer[] = [];

               doc.on('data', (chunk) => buffers.push(chunk));
               doc.on('end', () => {
                    resolve(Buffer.concat(buffers));
               });
               doc.on('error', (err) => {
                    reject(err);
               });

               // 1. INVOICE Title
               doc.fontSize(16)
                  .font('Helvetica-Bold')
                  .fillColor('#002B5C')
                  .text('INVOICE', 30, 30, { align: 'center' });

               // Draw Top border for corporate details box
               doc.strokeColor('#D1D5DB')
                  .lineWidth(0.5);

               // Left Box (Corporate details)
               doc.rect(30, 55, 260, 115).stroke();
               
               // Red Logo Square (70x70, centered vertically: y = 55 + (115 - 70)/2 = 77.5)
               const logoX = 38;
               const logoY = 77.5;
               const logoSize = 70;

               const logoPath = path.join(process.cwd(), 'assets', 'logo.jpeg');
               if (fs.existsSync(logoPath)) {
                    doc.image(logoPath, logoX, logoY, { width: logoSize, height: logoSize });
               } else {
                    // Fallback vector drawing
                    doc.rect(logoX, logoY, logoSize, logoSize)
                       .fillColor('#E11B22')
                       .fill();

                    // Draw White Fingerprint Arches inside the red square
                    const cx = logoX + logoSize / 2;
                    const baseY = logoY + 48;
                    doc.strokeColor('#FFFFFF').lineWidth(1.8).lineCap('round');
                    
                    // Concentric arches
                    doc.moveTo(cx - 5, baseY).quadraticCurveTo(cx, baseY - 6, cx + 5, baseY).stroke();
                    doc.moveTo(cx - 10, baseY).quadraticCurveTo(cx, baseY - 12, cx + 10, baseY).stroke();
                    doc.moveTo(cx - 15, baseY).quadraticCurveTo(cx, baseY - 18, cx + 15, baseY).stroke();
                    doc.moveTo(cx - 20, baseY).quadraticCurveTo(cx, baseY - 25, cx + 20, baseY).stroke();
                    doc.moveTo(cx - 25, baseY).quadraticCurveTo(cx, baseY - 32, cx + 25, baseY).stroke();
                    doc.moveTo(cx - 29, baseY).quadraticCurveTo(cx, baseY - 38, cx + 29, baseY).stroke();

                    // Logo Typography at the bottom of the red square
                    doc.fillColor('#FFFFFF')
                       .fontSize(9.5)
                       .font('Helvetica-Bold')
                       .text('OakBridge', logoX, logoY + 54, { width: logoSize, align: 'center' });
               }

               // Corporate details text next to logo
               doc.fillColor('#002B5C')
                  .fontSize(9)
                  .font('Helvetica-Bold')
                  .text('Oakbridge Publishing Pvt. Ltd.', 118, 63)
                  .font('Helvetica')
                  .fillColor('#374151')
                  .text('934, 9th Floor, Tower B3,\nSpaze iTech Park, Sector 49,\nGurgaon 122018\nGSTIN/UIN: 06AACCO5406D1ZW\nState Name: Haryana, Code: 06\nContact: 01244305970, 8800337299\nE-Mail: fpa@oakbridge.in', 118, 75, { lineGap: 1.5 });

               // Right Box (Invoice metadata table)
               doc.rect(290, 55, 275, 115).stroke();

               // Vertical divider in right metadata table box
               doc.moveTo(385, 55).lineTo(385, 170).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
               
               // Metadata rows
               const meta = [
                    { label: 'Contact', value: '01244305970, 8800337299' },
                    { label: 'Invoice No.', value: data.invoiceNo },
                    { label: 'Dated', value: data.date },
                    { label: 'Order No.', value: data.orderNo },
                    { label: 'Payment Ref', value: data.paymentRef },
                    { label: 'Mode of Payment', value: 'Prepaid (Razorpay)' }
               ];

               let metaY = 55;
               meta.forEach((m, idx) => {
                    // Draw horizontal dividers inside metadata box
                    if (idx > 0) {
                         doc.moveTo(290, metaY).lineTo(565, metaY).strokeColor('#E5E7EB').stroke();
                    }
                    doc.font('Helvetica')
                       .fontSize(7.5)
                       .fillColor('#4B5563')
                       .text(m.label, 296, metaY + 5)
                       .font('Helvetica-Bold')
                       .fillColor('#1F2937')
                       .text(m.value, 391, metaY + 5);
                    metaY += 19.16;
               });

               // 3. Buyer & Consignee boxes
               const formatAddress = (addr: string): string => {
                    if (!addr) return 'Digital Delivery / Online Shelf';
                    if (addr.includes('\n')) return addr;
                    if (addr.includes(',')) {
                         return addr.split(',').map(p => p.trim()).filter(Boolean).join('\n');
                    }
                    return addr;
               };

               const rawShippingAddress = data.shippingAddress || '';
               const rawBillingAddress = data.billingAddress || '';
               const shippingAddressStr = formatAddress(rawShippingAddress);
               const billingAddressStr = formatAddress(rawBillingAddress || rawShippingAddress);
               const buyerY = 178;
               
               // Buyer Box
               doc.rect(30, buyerY, 260, 90).strokeColor('#D1D5DB').stroke();
               doc.font('Helvetica')
                  .fontSize(7.5)
                  .fillColor('#6B7280')
                  .text('Buyer (Bill to)', 36, buyerY + 6)
                  .font('Helvetica-Bold')
                  .fontSize(8.5)
                  .fillColor('#002B5C')
                  .text(data.buyerName, 36, buyerY + 16)
                  .font('Helvetica')
                  .fontSize(8)
                  .fillColor('#374151')
                  .text(billingAddressStr, 36, buyerY + 28, { width: 248, lineGap: 1.5 });

               // Consignee Box
               doc.rect(290, buyerY, 275, 90).stroke();
               doc.font('Helvetica')
                  .fontSize(7.5)
                  .fillColor('#6B7280')
                  .text('Consignee (Ship to)', 296, buyerY + 6)
                  .font('Helvetica-Bold')
                  .fontSize(8.5)
                  .fillColor('#002B5C')
                  .text(data.buyerName, 296, buyerY + 16)
                  .font('Helvetica')
                  .fontSize(8)
                  .fillColor('#374151')
                  .text(shippingAddressStr, 296, buyerY + 28, { width: 263, lineGap: 1.5 });

               // Place of supply
               doc.font('Helvetica')
                  .fontSize(8)
                  .fillColor('#4B5563')
                  .text('Place of Supply: Haryana', 30, buyerY + 96);

               // 4. Products Table
               const tableY = 286;
               const tableHeight = 220;
               
               // Draw full table boundary box
               doc.rect(30, tableY, 535, tableHeight).strokeColor('#002B5C').lineWidth(0.5).stroke();

               // Table Columns Definition
               const cols = [
                    { label: 'Sl', x: 30, w: 20, align: 'center' },
                    { label: 'Description of Goods', x: 50, w: 200, align: 'left' },
                    { label: 'ISBN', x: 250, w: 80, align: 'left' },
                    { label: 'Author', x: 330, w: 100, align: 'left' },
                    { label: 'Qty', x: 430, w: 35, align: 'right' },
                    { label: 'Rate', x: 465, w: 45, align: 'right' },
                    { label: 'Disc %', x: 510, w: 15, align: 'right' },
                    { label: 'Amount', x: 525, w: 40, align: 'right' }
               ];

               // Draw Table Header Fill
               doc.rect(30.25, tableY + 0.25, 534.5, 17.5)
                  .fillColor('#002B5C')
                  .fill();

               // Table Header Text
               doc.fillColor('#FFFFFF')
                  .font('Helvetica-Bold')
                  .fontSize(7.5);
               cols.forEach(c => {
                    const textWidth = c.align === 'right' ? c.w - 3 : c.w - 6;
                    const textX = c.align === 'left' ? c.x + 4 : c.x;
                    doc.text(c.label, textX, tableY + 5, { width: textWidth, align: c.align as any });
               });

               // Draw vertical grid lines for columns
               doc.strokeColor('#D1D5DB').lineWidth(0.5);
               cols.forEach((c, idx) => {
                    if (idx > 0) {
                         doc.moveTo(c.x, tableY).lineTo(c.x, tableY + tableHeight).stroke();
                    }
               });

               // Render Table Rows
               let rowY = tableY + 18;
               doc.fillColor('#1F2937')
                  .fontSize(7.5);

               let displayItems = data.items;
               if (data.tier) {
                    // Subscription fallback item
                    displayItems = [{
                         title: `Oakbridge ${data.tier} Membership Subscription (1-Year Access)`,
                         author: 'N/A',
                         isbn: 'N/A',
                         price: data.totalAmount
                    }];
               }

               // Group duplicate items to calculate quantities
               const groupedMap = new Map<string, {
                    title: string;
                    author?: string;
                    isbn?: string;
                    price: number;
                    qty: number;
               }>();

               displayItems.forEach(item => {
                    const key = item.isbn || item.title;
                    if (groupedMap.has(key)) {
                         groupedMap.get(key)!.qty += 1;
                    } else {
                         groupedMap.set(key, { ...item, qty: 1 });
                    }
               });

               const aggregatedItems = Array.from(groupedMap.values());

               // Number formatting helper (INR style format)
               const formatINR = (val: number): string => {
                    return val.toLocaleString('en-IN', {
                         minimumFractionDigits: 2,
                         maximumFractionDigits: 2
                    });
               };

               aggregatedItems.forEach((item, idx) => {
                    const rateVal = item.price / 100;
                    const amountVal = (item.price * item.qty) / 100;
                    const rateFormatted = formatINR(rateVal);
                    const amountFormatted = formatINR(amountVal);

                    const titleHeight = doc.heightOfString(item.title, { width: cols[1].w - 8 });
                    const authorHeight = doc.heightOfString(item.author || 'N/A', { width: cols[3].w - 8 });
                    const rowHeight = Math.max(titleHeight, authorHeight, 14) + 8;

                    doc.font('Helvetica')
                       .text(String(idx + 1), cols[0].x, rowY + 4, { width: cols[0].w, align: 'center' })
                       .font('Helvetica-Bold')
                       .fillColor('#002B5C')
                       .text(item.title, cols[1].x + 4, rowY + 4, { width: cols[1].w - 8 })
                       .font('Helvetica')
                       .fillColor('#1F2937')
                       .text(item.isbn || 'N/A', cols[2].x + 4, rowY + 4, { width: cols[2].w - 8 })
                       .text(item.author || 'N/A', cols[3].x + 4, rowY + 4, { width: cols[3].w - 8 })
                       .text(`${item.qty} Nos.`, cols[4].x, rowY + 4, { width: cols[4].w - 3, align: 'right' })
                       .text(rateFormatted, cols[5].x, rowY + 4, { width: cols[5].w - 3, align: 'right' })
                       .text('', cols[6].x, rowY + 4, { width: cols[6].w - 3, align: 'right' })
                       .text(amountFormatted, cols[7].x, rowY + 4, { width: cols[7].w - 3, align: 'right' });

                    // Draw line below row
                    doc.moveTo(30, rowY + rowHeight).lineTo(565, rowY + rowHeight).strokeColor('#E5E7EB').stroke();
                    rowY += rowHeight;
               });

               // Subtotal & Total rows block at bottom of table
               const totalRowY = tableY + tableHeight - 30;
               doc.moveTo(30, totalRowY).lineTo(565, totalRowY).strokeColor('#002B5C').lineWidth(0.5).stroke();
               
               const totalInr = formatINR(data.totalAmount / 100);

               doc.font('Helvetica')
                  .fontSize(7.5)
                  .fillColor('#4B5563')
                  .text('Subtotal', 330, totalRowY + 4, { width: 150, align: 'right' })
                  .font('Helvetica-Bold')
                  .fillColor('#1F2937')
                  .text(totalInr, 490, totalRowY + 4, { width: 75, align: 'right' });

               doc.moveTo(30, totalRowY + 14).lineTo(565, totalRowY + 14).strokeColor('#E5E7EB').stroke();

               doc.font('Helvetica-Bold')
                  .fontSize(8.5)
                  .fillColor('#002B5C')
                  .text('Total', 330, totalRowY + 17, { width: 150, align: 'right' })
                  .text(`INR ${totalInr}`, 490, totalRowY + 17, { width: 75, align: 'right' });

               // 5. Amount Chargeable in words
               const wordsY = tableY + tableHeight + 8;
               const amountInRupees = Math.floor(data.totalAmount / 100);
               const words = numberToWords(amountInRupees);

               doc.font('Helvetica-Bold')
                  .fontSize(8)
                  .fillColor('#374151')
                  .text('Amount Chargeable (in words): ', 30, wordsY)
                  .font('Helvetica')
                  .text(`INR ${words} Only`, 160, wordsY);

               // 6. Declaration & Company Bank Details box at bottom
               const footerBoxY = wordsY + 22;
               const footerBoxHeight = 85;

               // Left Box (Declaration)
               doc.rect(30, footerBoxY, 260, footerBoxHeight).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
               doc.font('Helvetica-Bold')
                  .fontSize(8)
                  .fillColor('#002B5C')
                  .text('Declaration', 36, footerBoxY + 6)
                  .font('Helvetica')
                  .fontSize(7)
                  .fillColor('#4B5563')
                  .text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 36, footerBoxY + 16, { width: 248, lineGap: 1.5 })
                  .fontSize(7.5)
                  .text('for Oakbridge Publishing Pvt. Ltd.', 36, footerBoxY + 48)
                  .font('Helvetica-Bold')
                  .text('Authorised Signatory', 36, footerBoxY + 70);

               // Right Box (Bank Details)
               doc.rect(290, footerBoxY, 275, footerBoxHeight).stroke();
               doc.font('Helvetica-Bold')
                  .fontSize(8)
                  .fillColor('#002B5C')
                  .text("Company's Bank Details", 296, footerBoxY + 6)
                  .font('Helvetica')
                  .fontSize(7.5)
                  .fillColor('#374151')
                  .text('Bank Name: ', 296, footerBoxY + 18)
                  .font('Helvetica-Bold')
                  .text('HDFC BANK - Current Account', 360, footerBoxY + 18)
                  .font('Helvetica')
                  .text('A/c No.: ', 296, footerBoxY + 30)
                  .font('Helvetica-Bold')
                  .text('50200026419143', 360, footerBoxY + 30)
                  .font('Helvetica')
                  .text('Branch & IFS Code: ', 296, footerBoxY + 42)
                  .font('Helvetica-Bold')
                  .text('FIRST INDIA BRANCH & HDFC0000280', 380, footerBoxY + 42, { width: 180 });

               // 7. Computer Generated note
               doc.font('Helvetica')
                  .fontSize(7.5)
                  .fillColor('#9CA3AF')
                  .text('This is a Computer Generated Invoice', 30, footerBoxY + footerBoxHeight + 8, { align: 'center' });

               // Finish document
               doc.end();
          } catch (e) {
               reject(e);
          }
     });
};
