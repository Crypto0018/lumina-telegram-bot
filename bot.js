const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Firebase Admin SDK Initialize
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

// ============ টেলিগ্রাম বট কমান্ড ============

// Start কমান্ড
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'No username';
    
    await ctx.reply(
        `🎉 Welcome to Lumina Verification Bot!\n\n` +
        `Your ID: ${userId}\n` +
        `Username: @${username}\n\n` +
        `Available Commands:\n` +
        `/verify - Verify your tasks\n` +
        `/status - Check your verification status\n` +
        `/help - Show this message`
    );
});

// Help কমান্ড
bot.help(async (ctx) => {
    await ctx.reply(
        `📌 *How to Verify Tasks:*\n\n` +
        `1️⃣ Join @global_lumina channel\n` +
        `2️⃣ Click /verify command\n` +
        `3️⃣ Wait for confirmation\n` +
        `4️⃣ Return to app and claim reward\n\n` +
        `*Commands:*\n` +
        `/verify - Verify channel join\n` +
        `/status - Check verification status\n` +
        `/help - Show help`,
        { parse_mode: 'Markdown' }
    );
});

// Verify কমান্ড - চ্যানেল জয়েন চেক করে
bot.command('verify', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || 'anonymous';
    const telegramUserId = `tg_${userId}`;
    
    try {
        // চেক করা ইউজার চ্যানেলে জয়েন করেছে কিনা
        const chatMember = await ctx.telegram.getChatMember('@global_lumina', userId);
        const isMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
        
        if (isMember) {
            // ইউজার চ্যানেলে আছে, Firebase এ আপডেট করুন
            const userRef = db.collection('users').doc(telegramUserId);
            const userDoc = await userRef.get();
            
            if (!userDoc.exists) {
                // নতুন ইউজার
                await userRef.set({
                    telegramId: userId,
                    telegramUsername: username,
                    telegramVerified: true,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    balance: 0,
                    completedPermanent: false,
                    completedAdminTasks: []
                });
            } else {
                // বিদ্যমান ইউজার আপডেট
                await userRef.update({
                    telegramUsername: username,
                    telegramVerified: true,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            await ctx.reply(
                `✅ *Verification Successful!*\n\n` +
                `You have successfully joined @global_lumina.\n` +
                `🎁 Reward: 0.05 USDT\n\n` +
                `👉 Return to the Lumina app and click "Claim Reward" to get your USDT!`,
                { parse_mode: 'Markdown' }
            );
            
        } else {
            await ctx.reply(
                `❌ *Verification Failed!*\n\n` +
                `You haven't joined our channel yet.\n\n` +
                `Please join @global_lumina first, then click /verify again.\n\n` +
                `🔗 [Click here to join channel](https://t.me/global_lumina)`,
                { parse_mode: 'Markdown' }
            );
        }
        
    } catch (error) {
        console.error('Verification error:', error);
        await ctx.reply(
            `⚠️ *Error during verification*\n\n` +
            `Please try again or contact support.\n\n` +
            `Error: ${error.message}`,
            { parse_mode: 'Markdown' }
        );
    }
});

// Status কমান্ড - চেক করা ইউজারের স্ট্যাটাস
bot.command('status', async (ctx) => {
    const userId = ctx.from.id;
    const telegramUserId = `tg_${userId}`;
    
    try {
        const userDoc = await db.collection('users').doc(telegramUserId).get();
        
        if (userDoc.exists) {
            const data = userDoc.data();
            await ctx.reply(
                `📊 *Your Status*\n\n` +
                `✅ Channel Verified: ${data.telegramVerified ? 'Yes' : 'No'}\n` +
                `💰 Balance: ${data.balance || 0} USDT\n` +
                `📝 Tasks Completed: ${data.completedAdminTasks?.length || 0}\n` +
                `🏆 Permanent Task: ${data.completedPermanent ? 'Completed' : 'Pending'}\n\n` +
                `Use /verify to complete the permanent task!`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply(
                `📊 *Your Status*\n\n` +
                `❌ Not verified yet\n\n` +
                `Use /verify to join our channel and earn 0.05 USDT!`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        await ctx.reply('Error fetching status. Please try again.');
    }
});

// ============ API Endpoints for Web App ============

// চেক করা ইউজার ভেরিফাইড কিনা
app.post('/api/check-verification', async (req, res) => {
    const { userId } = req.body;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const isVerified = userDoc.exists ? userDoc.data()?.telegramVerified || false : false;
        
        res.json({ verified: isVerified });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// রিওয়ার্ড ক্লেইম করুন
app.post('/api/claim-reward', async (req, res) => {
    const { userId } = req.body;
    
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            return res.json({ success: false, message: 'User not found!' });
        }
        
        const userData = userDoc.data();
        
        // চেক করা ইউজার ভেরিফাইড কিনা এবং ইতিমধ্যে রিওয়ার্ড নেয়নি
        if (userData.telegramVerified && !userData.completedPermanent) {
            // রিওয়ার্ড যোগ করুন
            const currentBalance = userData.balance || 0;
            
            await userRef.update({
                balance: currentBalance + 0.05,
                completedPermanent: true,
                transactionHistory: admin.firestore.FieldValue.arrayUnion({
                    type: 'earn',
                    amount: 0.05,
                    task: 'Join Lumina Channel',
                    date: new Date().toISOString()
                })
            });
            
            res.json({ 
                success: true, 
                reward: 0.05,
                newBalance: currentBalance + 0.05
            });
        } else if (userData.completedPermanent) {
            res.json({ success: false, message: 'Reward already claimed!' });
        } else {
            res.json({ success: false, message: 'Not verified yet! Please use /verify in Telegram bot.' });
        }
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Start Bot & Server ============

// বট লঞ্চ করুন
bot.launch()
    .then(() => console.log('🤖 Telegram bot is running...'))
    .catch(err => console.error('Bot launch error:', err));

// API সার্ভার
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));