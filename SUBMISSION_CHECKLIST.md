# Chrome Web Store Submission Checklist

## Before You Submit

### 1. Developer Account
- [ ] Chrome Web Store developer account created
- [ ] $5 one-time registration fee paid
- [ ] Email verified

### 2. Extension Files
- [ ] Extension built (`npm run build:extension`)
- [ ] ZIP file created from `apps/extension/dist/` folder
- [ ] ZIP file is under 100MB
- [ ] All icons present (16x16, 32x32, 48x48, 128x128)
- [ ] manifest.json has correct version number

### 3. Store Listing Materials
- [ ] 3-5 screenshots (1280x800 pixels each)
- [ ] Extension name finalized: "Watch Pizza Party"
- [ ] Short description (132 characters)
- [ ] Detailed description prepared
- [ ] Category selected: Social & Communication
- [ ] Language: English

### 4. Legal Documents
- [ ] LICENSE file in repository
- [ ] Privacy Policy created and accessible
- [ ] Privacy Policy URL: https://raw.githubusercontent.com/bethechangeitaly-creator/watch-pizza-party/main/PRIVACY_POLICY.md
- [ ] Support URL: https://github.com/bethechangeitaly-creator/watch-pizza-party

### 5. Manifest.json Review
- [ ] Name: "Watch Pizza Party"
- [ ] Description is clear and concise
- [ ] Version: 1.0.2 (or current version)
- [ ] Manifest version: 3
- [ ] Icons paths correct
- [ ] Permissions justified
- [ ] Host permissions minimal (only netflix.com, youtube.com)

### 6. Code Quality
- [ ] No console.log statements in production code
- [ ] No hardcoded credentials or secrets
- [ ] All npm packages up to date
- [ ] TypeScript compiles without errors
- [ ] No ESLint errors

### 7. Functionality Testing
- [ ] Test creating a room
- [ ] Test joining a room
- [ ] Test chat functionality
- [ ] Test Netflix synchronization
- [ ] Test YouTube synchronization
- [ ] Test server status indicator
- [ ] Test all buttons and features
- [ ] Test in incognito mode
- [ ] Test volume boost feature
- [ ] Test light/dark mode toggle

### 8. Privacy & Security
- [ ] No data collection beyond what's stated in Privacy Policy
- [ ] No analytics tracking
- [ ] No ads or monetization code
- [ ] Encrypted connections (HTTPS/WSS)
- [ ] No personal information stored

### 9. Store Assets
- [ ] Promotional tile 440x280 (optional but recommended)
- [ ] Marquee promotional image 1400x560 (optional)
- [ ] Extension icon 128x128 (required, already in manifest)

---

## Submission Steps

### Step 1: Create ZIP File
```bash
cd apps/extension/dist
zip -r ../../../watch-pizza-party-v1.0.2.zip .
```

Verify ZIP contents:
- index.html
- popup.html
- manifest.json
- All JS files (background.js, content.js, etc.)
- All CSS files
- Icons folder
- assets folder

### Step 2: Chrome Web Store Developer Dashboard
1. Go to: https://chrome.google.com/webstore/devconsole
2. Click "New Item"
3. Upload `watch-pizza-party-v1.0.2.zip`

### Step 3: Fill Store Listing

**Product Details:**
- Name: Watch Pizza Party
- Summary: (Copy from STORE_LISTING.md - Short Description)
- Description: (Copy from STORE_LISTING.md - Detailed Description)
- Category: Social & Communication
- Language: English

**Graphics:**
- Upload 3-5 screenshots
- Upload icon 128x128 (from dist/icon128.png)
- Optional: Promotional images

**Privacy Practices:**
- Single Purpose: (Copy from STORE_LISTING.md)
- Permission Justifications: (Copy from STORE_LISTING.md)
- Data usage: Select "Does not collect user data"
- Privacy Policy URL: https://raw.githubusercontent.com/bethechangeitaly-creator/watch-pizza-party/main/PRIVACY_POLICY.md

**Distribution:**
- Select countries: All countries (recommended)
- Pricing: Free

**Website:**
- Official website: https://github.com/bethechangeitaly-creator/watch-pizza-party
- Support URL: https://github.com/bethechangeitaly-creator/watch-pizza-party

### Step 4: Submit for Review
1. Review all information
2. Click "Submit for Review"
3. Wait for Google review (typically 1-3 days)

---

## After Submission

### If Approved ✅
- Extension goes live on Chrome Web Store
- Users can find it by searching "Watch Pizza Party"
- Share the Chrome Web Store link
- Monitor reviews and respond to user feedback

### If Rejected ❌
Common reasons for rejection:
1. **Permissions too broad** → Justify each permission
2. **Privacy policy missing/incomplete** → Use our detailed policy
3. **Screenshots unclear** → Retake with better quality
4. **Single purpose unclear** → Clarify in description
5. **Manifest issues** → Double-check manifest.json

**What to do:**
1. Read rejection reason carefully
2. Fix the specific issue mentioned
3. Resubmit (no additional fee)

---

## Post-Launch Checklist

- [ ] Add Chrome Web Store badge to GitHub README
- [ ] Share on social media
- [ ] Ask friends/family to review
- [ ] Monitor for bugs via GitHub issues
- [ ] Respond to user reviews
- [ ] Plan future updates

---

## Chrome Web Store Badge (After Approval)

Add this to your README.md:

```markdown
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/YOUR_EXTENSION_ID.svg)](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/YOUR_EXTENSION_ID.svg)](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/YOUR_EXTENSION_ID.svg)](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
```

Replace `YOUR_EXTENSION_ID` with the actual ID from Chrome Web Store.

---

## Support Resources

- **Chrome Web Store Developer Documentation**: https://developer.chrome.com/docs/webstore/
- **Program Policies**: https://developer.chrome.com/docs/webstore/program-policies/
- **Best Practices**: https://developer.chrome.com/docs/webstore/best_practices/

---

Good luck with your submission! 🍕🚀
