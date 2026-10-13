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