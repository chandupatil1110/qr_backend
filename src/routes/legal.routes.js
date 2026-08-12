// Public legal / policy pages served over the web.
//
// Play Store REQUIRES a publicly-accessible Privacy Policy URL. Razorpay
// and consumer-protection expectations further require a Refund Policy
// and Shipping Policy for any app that takes payments and ships physical
// goods. These are all served over the same lightweight HTML shell to
// keep styling consistent with the /delete-account page.
//
// Content is duplicated from mobile/lib/core/legal_content.dart (the
// in-app canonical version). If you edit the wording of a policy, update
// BOTH places — otherwise Play Store reviewers may spot a mismatch
// between what the app shows and what the store listing links to.
//
// Routes mounted at the top level (no /api prefix) so URLs are clean and
// user-friendly:
//   /privacy-policy
//   /terms
//   /refund-policy
//   /shipping-policy

import { Router } from 'express';

const router = Router();

// ─── Brand / contact constants ─────────────────────────────────────────
// Keep in sync with LegalContent in mobile/lib/core/legal_content.dart.
const COMPANY = 'CP Network Private Limited';
const OFFICE = '401, Antriksh Building, Makhwana Road, Marol Andheri East, Mumbai, Maharashtra 400069';
const SUPPORT_EMAIL = 'support@qr4emergency.com';
const GRIEVANCE_EMAIL = 'grievance@cpnetwork.in';
const SUPPORT_PHONE = '+91-9665108102';

// ─── HTML shell ────────────────────────────────────────────────────────
// One template renders every policy. Same visual language as
// /delete-account so the whole "legal" area of the site feels cohesive.
function renderPolicy({ title, lastUpdated, intro, sections }) {
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const introHtml = intro
    ? `<p>${esc(intro).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`
    : '';

  const sectionsHtml = sections.map((s) => `
    <section>
      <h2>${esc(s.heading)}</h2>
      <p>${esc(s.body).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>
    </section>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)} · QR 4 Emergency</title>
  <meta name="description" content="${esc(title)} for QR 4 Emergency — operated by ${esc(COMPANY)}."/>
  <style>
    :root {
      --brand: #FF7A00; --brand-2: #DC2626;
      --ink: #111827; --ink-2: #4B5563; --ink-3: #6B7280;
      --line: #E5E7EB; --bg: #F5F7FB; --card: #FFFFFF;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--ink); line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
      color: #fff; padding: 32px 20px;
    }
    .header-inner { max-width: 780px; margin: 0 auto; }
    .brand {
      font-size: 12px; letter-spacing: 2.4px; font-weight: 800; opacity: 0.9;
    }
    .header h1 { margin: 8px 0 6px; font-size: 28px; font-weight: 800; }
    .header .meta { margin: 0; font-size: 13px; opacity: 0.92; }
    .wrap { max-width: 780px; margin: 0 auto; padding: 24px 20px 60px; }
    .card {
      background: var(--card); border-radius: 16px; padding: 28px 28px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    }
    section { margin-bottom: 24px; }
    h2 {
      margin: 0 0 8px; font-size: 17px; font-weight: 800;
      color: var(--ink);
    }
    p {
      margin: 0 0 10px; color: var(--ink-2); font-size: 15px;
    }
    .intro { color: var(--ink-2); font-size: 15px; margin-bottom: 22px; }
    a { color: var(--brand-2); font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .nav {
      display: flex; flex-wrap: wrap; gap: 8px;
      max-width: 780px; margin: 0 auto; padding: 14px 20px 0;
    }
    .nav a {
      font-size: 12px; padding: 6px 12px; border-radius: 999px;
      background: #fff; color: var(--ink-2); border: 1px solid var(--line);
    }
    .nav a[aria-current="page"] {
      background: var(--brand); color: #fff; border-color: var(--brand);
    }
    .footer {
      text-align: center; font-size: 12px; color: var(--ink-3);
      max-width: 780px; margin: 24px auto 0; padding: 0 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-inner">
      <div class="brand">QR 4 EMERGENCY · BE NAYAK</div>
      <h1>${esc(title)}</h1>
      <p class="meta">Last updated: ${esc(lastUpdated)}</p>
    </div>
  </div>

  <nav class="nav" aria-label="Legal pages">
    <a href="/privacy-policy" ${title === 'Privacy Policy' ? 'aria-current="page"' : ''}>Privacy Policy</a>
    <a href="/terms" ${title === 'Terms & Conditions' ? 'aria-current="page"' : ''}>Terms &amp; Conditions</a>
    <a href="/refund-policy" ${title === 'Refund &amp; Cancellation Policy' ? 'aria-current="page"' : ''}>Refund Policy</a>
    <a href="/shipping-policy" ${title === 'Shipping Policy' ? 'aria-current="page"' : ''}>Shipping Policy</a>
    <a href="/delete-account">Delete Account</a>
  </nav>

  <div class="wrap">
    <div class="card">
      ${intro ? `<div class="intro">${introHtml}</div>` : ''}
      ${sectionsHtml}
    </div>
    <div class="footer">
      ${esc(COMPANY)} · ${esc(OFFICE)}<br/>
      ${esc(SUPPORT_EMAIL)} · ${esc(SUPPORT_PHONE)}
    </div>
  </div>
</body>
</html>`;
}

// ─── Privacy Policy ────────────────────────────────────────────────────
const PRIVACY = {
  title: 'Privacy Policy',
  lastUpdated: '25 June 2026',
  intro:
    `QR 4 Emergency is a QR Code Vehicle Emergency Contact & Smart Parking Solution operated by ${COMPANY}.\n\n` +
    `Head Office: ${OFFICE}\n` +
    `Email: ${SUPPORT_EMAIL}\n` +
    `Effective Date: 25 June 2026`,
  sections: [
    {
      heading: '1. Introduction & Scope',
      body:
        'Welcome to QR 4 Emergency ("App", "Service", "Platform"). We are committed to protecting your personal information and complying with the Digital Personal Data Protection Act, 2023 (DPDP Act), the Information Technology Act, 2000, and other applicable laws.\n\n' +
        'This Privacy Policy explains:\n' +
        '• What information we collect\n' +
        '• How we use it\n' +
        '• How we protect it\n' +
        '• Your rights regarding your information\n\n' +
        'This Policy applies to all users of the QR 4 Emergency mobile application and related web services.\n\n' +
        'By registering or using QR 4 Emergency, you agree to this Privacy Policy.',
    },
    {
      heading: '2. Information We Collect',
      body:
        'We collect only the information necessary to provide our services.\n\n' +
        '2.1 Data You Provide Directly\n\n' +
        'When you create an account, we collect:\n' +
        '• Full Name\n' +
        '• Mobile Number (required for OTP verification)\n' +
        '• Vehicle Number\n' +
        '• Emergency Contacts (minimum 1 and maximum 4), including each contact\'s name and mobile number.\n' +
        '• Blood Group (Mandatory) — Required to help emergency responders and first responders identify your blood group during emergencies when your QR code is scanned.\n' +
        '• Shipping Address (Mandatory) — Required to process, ship, and deliver your purchased QR sticker.\n\n' +
        'We do not require your RC details, vehicle make, model, or other vehicle information.\n\n' +
        '2.2 Data Collected Automatically\n\n' +
        'With your permission, we may collect:\n' +
        '• Device information (device model, OS, app version, IP address, crash logs, performance data)\n' +
        '• QR scan information (date, time, QR ID, usage logs)\n' +
        '• Location (Optional): If a person scans your QR code, they may choose to share their location with you. Location sharing is completely optional and only shared with your consent.\n' +
        '• Call Details: After a call is completed through our masked calling service, the vehicle owner may receive call reference information such as date, time and duration.\n\n' +
        'We do not collect sensitive personal information such as financial information, biometrics, or health information.',
    },
    {
      heading: '3. How We Use Your Information',
      body:
        'We use your information to:\n' +
        '• Create and manage your account.\n' +
        '• Link your QR code with your vehicle.\n' +
        '• Connect QR scanners with vehicle owners through secure call masking.\n' +
        '• Notify vehicle owners regarding emergencies or parking issues.\n' +
        '• Maintain call history and service records.\n' +
        '• Improve app performance and security.\n' +
        '• Detect fraud and misuse.\n' +
        '• Comply with legal obligations.\n\n' +
        'We do not sell your personal information or use it for targeted advertising.',
    },
    {
      heading: '4. How We Share Your Information',
      body:
        'We never sell or rent your personal information.\n\n' +
        'Your information may be shared only with:\n' +
        '• Telecom and call masking providers (Exotel) to enable secure communication.\n' +
        '• Payment processors (Razorpay) to process one-time purchases.\n' +
        '• Cloud hosting and technical service providers (Railway, Supabase, Firebase).\n' +
        '• Government authorities when legally required.',
    },
    {
      heading: '5. Data Retention',
      body:
        'We retain data only as long as necessary.\n' +
        '• Account information remains until you delete your account.\n' +
        '• Call and scan logs may be retained for up to 12 months.\n' +
        '• Technical logs may be retained for up to 90 days.\n' +
        '• Payment records are retained for 8 years per Income Tax Act requirements.\n' +
        '• Deleted accounts are removed or anonymized within 30 days.',
    },
    {
      heading: '6. Your Rights',
      body:
        'You have the right to:\n' +
        '• Access your personal data.\n' +
        '• Correct inaccurate information.\n' +
        '• Delete your account and personal data.\n' +
        '• Withdraw consent.\n' +
        '• File a grievance.\n' +
        '• Nominate another person to exercise your rights where applicable.\n\n' +
        'You can exercise these rights through:\n' +
        '• App Settings\n' +
        `• Account deletion form: /delete-account\n` +
        `• Email: ${SUPPORT_EMAIL}`,
    },
    {
      heading: '7. Security',
      body:
        'We use industry-standard security measures including TLS encryption for all data in transit, secure servers with restricted access, and regular security monitoring.\n\n' +
        'All app-to-backend traffic is encrypted using HTTPS. Payment data is handled exclusively by Razorpay (PCI-DSS compliant) and never touches our servers in raw form.\n\n' +
        'Although we take reasonable precautions, no online system can guarantee complete security.',
    },
    {
      heading: "8. Children's Privacy",
      body:
        'QR 4 Emergency is intended for users aged 18 years and above.\n\n' +
        'We do not knowingly collect information from children.',
    },
    {
      heading: '9. International Data Transfers',
      body:
        'Your information is primarily stored and processed in India.\n\n' +
        'If data is transferred outside India, appropriate safeguards will be implemented.',
    },
    {
      heading: '10. Cookies & Analytics',
      body:
        'The app uses only essential storage and analytics required for service improvement.\n\n' +
        'We do not use third-party advertising or cross-app tracking.',
    },
    {
      heading: '11. Changes to This Policy',
      body:
        'We may update this Privacy Policy from time to time.\n\n' +
        'Any significant changes will be communicated through the app or by updating the Effective Date.',
    },
    {
      heading: '12. Grievance Officer',
      body:
        `${COMPANY}\n` +
        `Phone: ${SUPPORT_PHONE}\n` +
        `${OFFICE}\n` +
        `Email: ${GRIEVANCE_EMAIL}\n\n` +
        'We aim to resolve grievances within applicable legal timelines (typically 30 days).',
    },
    {
      heading: '13. Governing Law',
      body:
        'This Privacy Policy is governed by the laws of India.\n\n' +
        'Any disputes shall be subject to the jurisdiction of the courts of Mumbai, Maharashtra.',
    },
    {
      heading: '14. Contact Us',
      body:
        `${COMPANY}\n` +
        `Phone: ${SUPPORT_PHONE}\n` +
        `${OFFICE}\n` +
        `Email: ${SUPPORT_EMAIL}\n\n` +
        'Thank you for choosing QR 4 Emergency. Our goal is to help people connect quickly during emergencies while protecting your privacy and personal information.',
    },
  ],
};

// ─── Terms & Conditions ────────────────────────────────────────────────
const TERMS = {
  title: 'Terms & Conditions',
  lastUpdated: '21 July 2026',
  intro:
    `These Terms & Conditions ("Terms") govern your use of QR 4 Emergency, a service operated by ${COMPANY}. By registering, activating, or using the service, you agree to these Terms.`,
  sections: [
    {
      heading: '1. Eligibility',
      body:
        '• You must be at least 18 years old.\n' +
        '• You may register only vehicles that you own or are authorized to register.',
    },
    {
      heading: '2. Service Description',
      body:
        'QR 4 Emergency helps connect a QR scanner (bystander) with your nominated emergency contacts through a masked calling system operated by our telecom partner.\n\n' +
        'The service is NOT an emergency response service. It does not replace Police (100), Ambulance (108), Fire (101), or other emergency services. In an actual emergency, always dial the appropriate emergency number first.',
    },
    {
      heading: '3. User Responsibilities',
      body:
        'You agree to:\n' +
        '• Provide accurate information.\n' +
        '• Keep your emergency contacts updated.\n' +
        '• Keep your account and OTP secure.\n' +
        '• Use the service only for lawful purposes.\n' +
        '• Inform your emergency contacts that their numbers are registered on your QR.',
    },
    {
      heading: '4. Payment',
      body:
        '• One-time payment of ₹549 per QR sticker (inclusive of applicable taxes and shipping charges).\n' +
        '• The payment covers the physical sticker, its lifetime activation, and associated services for the life of the QR.\n' +
        '• Each additional QR requires a separate one-time payment.\n' +
        '• All payments are processed through Razorpay. We do not store your card or banking details.',
    },
    {
      heading: '5. Refund & Cancellation',
      body:
        'Please refer to our separate Refund & Cancellation Policy at /refund-policy for detailed terms.',
    },
    {
      heading: '6. Acceptable Use',
      body:
        'You must not:\n' +
        '• Register unauthorized vehicles or vehicles you do not own.\n' +
        '• Misuse the service or masked calling feature (e.g., prank calls, spam).\n' +
        '• Attempt unauthorized access, hacking, reverse engineering, or scraping of the service.\n' +
        '• Impersonate another person.\n' +
        '• Use the service to harass, threaten, or defraud others.\n\n' +
        'Violation may result in immediate account termination without refund.',
    },
    {
      heading: '7. Limitation of Liability',
      body:
        `${COMPANY} shall not be liable for:\n` +
        '• Failure of any emergency contact to answer a call.\n' +
        '• Delays caused by telecom operators or network conditions.\n' +
        '• Consequential damages arising from missed calls, incorrect contact information, or service unavailability.\n\n' +
        'Our maximum liability under any circumstance is limited to the amount you paid for the QR sticker.',
    },
    {
      heading: '8. Suspension and Termination',
      body:
        'We may suspend or terminate your account if:\n' +
        '• You violate these Terms.\n' +
        '• Fraudulent or abusive usage is detected.\n' +
        '• Legal or regulatory authorities require it.\n\n' +
        'You may delete your account at any time through the app or via the /delete-account page.',
    },
    {
      heading: '9. Changes to Terms',
      body:
        'We may update these Terms from time to time. Material changes will be communicated through the app or by updating the "Last updated" date above. Continued use after changes constitutes acceptance.',
    },
    {
      heading: '10. Governing Law',
      body:
        'These Terms are governed by the laws of India. Disputes shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.',
    },
    {
      heading: '11. Contact',
      body:
        `${COMPANY}\n` +
        `${OFFICE}\n` +
        `Email: ${SUPPORT_EMAIL}\n` +
        `Phone: ${SUPPORT_PHONE}`,
    },
  ],
};

// ─── Refund Policy ─────────────────────────────────────────────────────
const REFUND = {
  title: 'Refund & Cancellation Policy',
  lastUpdated: '21 July 2026',
  intro:
    `This Refund & Cancellation Policy applies to purchases made through the QR 4 Emergency mobile application. Payments are processed by Razorpay on behalf of ${COMPANY}.`,
  sections: [
    {
      heading: '1. Nature of the Product',
      body:
        'A QR 4 Emergency purchase includes:\n' +
        '• A physical QR sticker (weatherproof, custom-printed with your unique QR code).\n' +
        '• Lifetime activation of the QR (no annual renewal required).\n' +
        '• Masked calling service via our telecom partner for the lifetime of the QR.\n\n' +
        'The product is customised — each QR is unique to your vehicle and linked to your emergency contacts.',
    },
    {
      heading: '2. Cancellation Window',
      body:
        'You may cancel your order and request a full refund at any time BEFORE the QR sticker is shipped from our facility.\n\n' +
        'Once the sticker enters the shipping process (typically within 24-48 hours of order), the order cannot be cancelled for a full refund because production has begun.',
    },
    {
      heading: '3. Refund Eligibility',
      body:
        'Full refund (100%): If the sticker has not yet been shipped.\n\n' +
        'Partial refund: If the sticker has been shipped but not activated by you, you may return it (postage borne by you). Once received in re-sellable condition, we will refund the amount minus shipping costs and a ₹50 processing fee.\n\n' +
        'No refund: Once you have activated the QR sticker by scanning it and completing the registration flow, the service is considered rendered and is non-refundable except in cases of documented product defect (see Section 4).',
    },
    {
      heading: '4. Defective Product',
      body:
        'If the sticker arrives damaged or non-scannable, contact us within 7 days of delivery with photos of the defect. We will ship a replacement at no additional cost, or provide a full refund at our discretion.',
    },
    {
      heading: '5. How to Request a Refund',
      body:
        `Email ${SUPPORT_EMAIL} with:\n` +
        '• Your registered mobile number\n' +
        '• Order/payment reference from Razorpay\n' +
        '• Reason for refund\n\n' +
        'We will respond within 2 business days and process approved refunds within 7-10 business days to your original payment method.',
    },
    {
      heading: '6. Payment Failure',
      body:
        'If your payment is deducted but the order is not created due to a technical issue, contact us immediately. We will investigate with Razorpay and either complete your order or refund the amount within 7 business days.',
    },
    {
      heading: '7. Contact',
      body:
        `${COMPANY}\n` +
        `Email: ${SUPPORT_EMAIL}\n` +
        `Phone: ${SUPPORT_PHONE}\n` +
        `${OFFICE}`,
    },
  ],
};

// ─── Shipping Policy ───────────────────────────────────────────────────
const SHIPPING = {
  title: 'Shipping Policy',
  lastUpdated: '21 July 2026',
  intro:
    `This Shipping Policy describes how QR 4 Emergency stickers are delivered to customers within India. Orders are shipped by ${COMPANY} through partnered courier services.`,
  sections: [
    {
      heading: '1. Delivery Coverage',
      body:
        'We currently deliver only within India. We do not ship internationally.\n\n' +
        'All major cities and PIN codes across India are serviced through our courier partners. Remote and hard-to-reach locations may take longer.',
    },
    {
      heading: '2. Processing Time',
      body:
        'Orders are processed within 24-48 hours of successful payment. The QR sticker is custom-printed for your registered vehicle and undergoes quality inspection before dispatch.',
    },
    {
      heading: '3. Delivery Timeline',
      body:
        'Standard delivery: 3-5 working days from the date of dispatch, depending on your location.\n\n' +
        'Metro cities: typically 2-3 working days.\n\n' +
        'Remote areas and northeastern states: may take 5-7 working days.\n\n' +
        'Delivery timelines are indicative and may vary due to courier partner capacity, weather, festivals, or local disruptions.',
    },
    {
      heading: '4. Shipping Charges',
      body:
        'Shipping is included in the one-time purchase price of ₹549. No additional shipping charges are levied at checkout.',
    },
    {
      heading: '5. Tracking',
      body:
        'Once your order is shipped, a tracking number will be sent to your registered mobile number via SMS. You can track your shipment on the courier partner\'s website using this tracking number.',
    },
    {
      heading: '6. Delivery Attempts',
      body:
        'Our courier partner will attempt delivery up to 3 times. If all attempts fail, the shipment is returned to us. You may request re-shipment by paying reasonable additional shipping charges, or request a refund (subject to our Refund Policy).',
    },
    {
      heading: '7. Damaged or Missing Shipments',
      body:
        'If your order arrives damaged, please refuse the delivery and contact us within 24 hours. If a shipment is marked "delivered" but you have not received it, contact us within 48 hours so we can investigate with the courier partner.',
    },
    {
      heading: '8. Address Accuracy',
      body:
        'It is your responsibility to provide an accurate shipping address, PIN code, and contact number during registration. We are not liable for non-delivery caused by incorrect address information provided by you.',
    },
    {
      heading: '9. Contact',
      body:
        `${COMPANY}\n` +
        `Email: ${SUPPORT_EMAIL}\n` +
        `Phone: ${SUPPORT_PHONE}\n` +
        `${OFFICE}`,
    },
  ],
};

// ─── Routes ────────────────────────────────────────────────────────────
router.get('/privacy-policy', (req, res) => {
  res.type('html').send(renderPolicy(PRIVACY));
});

router.get('/terms', (req, res) => {
  res.type('html').send(renderPolicy(TERMS));
});

router.get('/refund-policy', (req, res) => {
  res.type('html').send(renderPolicy(REFUND));
});

router.get('/shipping-policy', (req, res) => {
  res.type('html').send(renderPolicy(SHIPPING));
});

export default router;
