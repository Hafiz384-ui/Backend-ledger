import accountModel from '../models/account.model.js'
import { seedSystemAccountBalance, ensureSystemAccountSufficientBalance } from '../services/systemAccount.service.js'

export const createAccountController = async (req, res) => {
    try {
        const user = req.user;

        // Hard enforcement for system users: system users can only have one account
        if (user.systemUser) {
            const isSystemAccountExist = await accountModel.findOne({
                user: user._id,
            });

            if (isSystemAccountExist) {
                return res.status(400).json({ message: "System account already exists. System user can only create one account." });
            }

            const account = await accountModel.create({
                user: user._id
            });

            // Automatically seed large initial reserve balance so system account balance is never negative
            await seedSystemAccountBalance(account._id);

            return res.status(201).json({ message: "Account created successfully", account });
        }

        const account = await accountModel.create({
            user: user._id
        });

        return res.status(201).json({ message: "Account created successfully", account });
    } catch (error) {
        if (error.message && (error.message.includes("System user") || error.message.includes("system account"))) {
            return res.status(403).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message || "Internal server error" });
    }
}

export const getAccountController = async(req, res) => {
    try {
        const user = req.user;
        const account = await accountModel.find({
            user: user._id
        })
        
        return res.status(200).json({ account })
    } catch (error) {
        return res.status(500).json({message:"Account not found", error})
    }
}


export const getUserAccountBalance  = async (req, res)=>{
    try {
        const {accountId} = req.params;
        console.log(accountId);
        

        const userAccount = await accountModel.findOne({ _id: accountId, user: req.user._id })
        console.log(userAccount);
        
        if(!userAccount){
            return res.status(404).json({message: "Account not found"})
        }

        // Auto-heal/refill if system account balance is depleted or negative
        if (req.user?.systemUser) {
            await ensureSystemAccountSufficientBalance(userAccount, 0);
        }

        const balance = await userAccount.getBalance();
        res.status(200).json({message: `Your total balance is ${balance}`, balance: balance, accountId: userAccount._id})
        
    } catch (error) {
        res.status(500).json({message: "Internal server error", error})
    }
}