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