/**
 * ============================================================
 * MEEG OPERATIONS DASHBOARD — AUTOMATED EMAIL DISPATCHER
 * ============================================================
 * Instructions:
 * 1. Open Google Drive (or script.google.com).
 * 2. Create a new Google Apps Script project (or open your existing one).
 * 3. Copy & paste this code into Code.gs and save.
 * 4. Click: Deploy (نشر) -> New deployment (توزيع جديد) -> Select type: Web app (تطبيق ويب).
 * 5. Configuration:
 *    - Description: MEEG Mailer Service
 *    - Execute as: Me (حسابي)
 *    - Who has access: Anyone (أي شخص)
 * 6. Click Deploy and copy the Web app URL (ends with /exec).
 * 7. Paste that URL into the Dashboard under: Manage Users -> ⚙️ Email Webhook Settings.
 * ============================================================
 */

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};

  // Health check ping
  if (!p.action || p.action === "test") {
    return ContentService.createTextOutput(JSON.stringify({ status: "OK", service: "MEEG Mailer Active" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Action: Send Password Reset Code
  if (p.action === "send_reset_code" && p.to && p.code) {
    try {
      var toEmail = p.to.trim();
      var employeeName = p.name ? p.name.trim() : "Team Member";
      var username = p.username ? p.username.trim() : "";
      var resetCode = p.code.trim();

      var subject = "🔐 MEEG Dashboard - كود استعادة كلمة المرور: " + resetCode;

      var html = '<div dir="rtl" style="font-family: Arial, Tahoma, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1.5px solid #0d9488; border-radius: 14px; background: #ffffff; color: #1e293b;">'
        + '<div style="text-align: center; margin-bottom: 20px;">'
        + '  <div style="font-size: 38px; margin-bottom: 6px;">🔐</div>'
        + '  <h2 style="color: #0d9488; margin: 0; font-size: 22px; font-weight: 800;">MEEG Operations Dashboard</h2>'
        + '  <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">نظام إدارة وتتبع العمليات الداخلية المعتمد</p>'
        + '</div>'
        + '<div style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; margin-bottom: 22px; font-size: 14px; line-height: 1.6; border: 1px solid #e2e8f0;">'
        + '  <p style="margin: 0 0 8px 0; font-size: 15px;">مرحباً <strong>' + employeeName + '</strong>،</p>'
        + '  <p style="margin: 0; color: #334155;">قام مسؤول النظام (Admin) بالموافقة على طلبك لإعادة تعيين كلمة المرور لحسابك: <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #0f766e; font-weight: bold;">@' + username + '</code>.</p>'
        + '</div>'
        + '<div style="text-align: center; padding: 22px; background: #f0fdfa; border: 2px dashed #0d9488; border-radius: 12px; margin-bottom: 22px;">'
        + '  <span style="display: block; font-size: 12px; font-weight: 800; color: #0f766e; margin-bottom: 8px; letter-spacing: 1px; text-transform: uppercase;">كود التحقق السري المؤقت (One-Time Verification Code)</span>'
        + '  <span style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #0d9488; font-family: Consolas, monospace; display: inline-block; padding: 4px 18px; background: #ffffff; border-radius: 8px; border: 1px solid #99f6e4;">' + resetCode + '</span>'
        + '</div>'
        + '<div style="font-size: 13px; color: #475569; line-height: 1.7; margin-bottom: 20px;">'
        + '  <strong style="color: #0f172a; display: block; margin-bottom: 6px;">📋 خطوات تفعيل كلمة المرور الجديدة:</strong>'
        + '  <ol style="margin: 0; padding-right: 22px;">'
        + '    <li>افتح صفحة تسجيل الدخول في الداش بورد.</li>'
        + '    <li>اضغط على <strong>Reset Password</strong>.</li>'
        + '    <li>اكتب اسم المستخدم أو بريدك الإلكتروني وهذا الكود: <strong>' + resetCode + '</strong>.</li>'
        + '    <li>اكتب كلمة المرور السرية الجديدة التي تختارها واضغط تأكيد.</li>'
        + '  </ol>'
        + '</div>'
        + '<div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center; line-height: 1.5;">'
        + '  🛡️ هذا الكود سري وصالح للاستخدام لمرة واحدة فقط لحسابك. إذا لم تكن أنت من طلب إعادة تعيين كلمة المرور، يرجى إبلاغ مسؤول النظام فوراً.'
        + '</div>'
        + '</div>';

      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        htmlBody: html
      });

      return ContentService.createTextOutput(JSON.stringify({ status: "success", to: toEmail }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // Support both GET and POST
  return doGet(e);
}
