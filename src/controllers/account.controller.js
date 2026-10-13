import accountModel from '../models/account.model.js'

export const createAccountController = async (req, res) => {
    try {
        const user = req.user;

        const account = await accountModel.create({
            user: user._id
        })

        return res.status(201).json({ account })
    } catch (error) {
        return res.status(500).json({})
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


        const balance = await userAccount.getBalance();
        res.status(200).json({message: `Your total balance is ${balance}`, balance: balance, accountId: userAccount._id})
        
    } catch (error) {
        res.status(500).json({message: "Internal server error", error})
    }
}