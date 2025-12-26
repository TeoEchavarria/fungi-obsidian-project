# Commenting Feature

## Overview

The FunGuild application now supports user comments on individual fungal records. Authenticated users can leave annotations, ask questions, or share insights about specific taxa.

## Features

- 💬 **Read Comments**: Anyone can view comments (including anonymous users)
- ✍️ **Post Comments**: Authenticated and approved users can add comments
- 🔒 **Secure**: Server-side authentication and authorization
- 📱 **Responsive**: Works beautifully on mobile and desktop
- ⚡ **Real-time**: Comments appear immediately after posting

## How to Comment

### 1. Log In

Click the "Login" button in the header and sign in with your approved account.

### 2. Open a Record

Click any record in the table to open its detail modal.

### 3. Scroll to Comments

The comments section appears at the bottom of the modal, below the record metadata.

### 4. Add Your Comment

- Type your comment in the textarea (1-1000 characters)
- Watch the character counter to stay within limits
- Click "Post Comment" to submit

Your comment will appear immediately with your email and timestamp.

## Comment Guidelines

- **Be Respectful**: Maintain a professional, scientific tone
- **Be Concise**: Comments are limited to 1000 characters
- **Be Accurate**: Share credible information with sources when possible
- **No Spam**: Avoid repetitive or promotional content

## Technical Details

### Data Model

Comments are stored in MongoDB with the following structure:

```javascript
{
  record_guid: string,       // Links to the funguild record
  author_email: string,       // Your email address
  content: string,            // Your comment (1-1000 chars)
  created_at: Date           // Timestamp
}
```

### Security

- **Read**: Anyone can view comments (public)
- **Write**: Only authenticated and approved users can post
- **Server Enforcement**: Your identity is verified server-side to prevent spoofing

### API Endpoints

- `GET /api/comments?record_guid=<guid>` - Fetch comments for a record
- `POST /api/comments` - Create a new comment (requires authentication)

## FAQs

**Q: Can I edit or delete my comments?**  
A: Not currently. Comments are append-only. Contact an administrator if you need to modify a comment.

**Q: Why can't I comment?**  
A: Ensure you're logged in and your account has been approved. Check for the "Logout" button in the header to confirm you're authenticated.

**Q: Do comments count toward the database?**  
A: No. Comments are stored separately in MongoDB and don't affect the scientific data in the SQLite database.

**Q: Can I add links or formatting?**  
A: Currently, only plain text is supported. Markdown may be added in future versions.

**Q: How are comments sorted?**  
A: Comments display in chronological order, with the oldest first.

## Related Documentation

- [API Documentation](./05-api.md) - Technical details on the comments API
- [Deployment Guide](./06-deployment.md) - How to deploy with commenting enabled

## Future Enhancements

We're considering these features for future releases:

- Edit/delete your own comments
- Markdown formatting support
- @ mentions for other users
- Comment moderation tools for admins
- Email notifications for new comments
- Threaded replies

---

**Have feedback about the commenting system?** Leave a comment on any record or contact the development team!
