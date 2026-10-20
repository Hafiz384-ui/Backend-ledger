import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Please enter a valid email"],
            lowercase: true
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minLength: [6, "Password must be at least 6 characters long"],
            select: false
        },
        systemUser: {
            type: Boolean,
            default: false,
            immutable: true,
            select: false
        }
    },
    { timestamps: true }
);

/**
 * Pre-save Hook:
 * 1. Hashes user password if created or modified.
 * 2. Blocks any attempt to mutate 'systemUser' on an existing user document.
 * 3. Enforces Single System User constraint: If systemUser is true, verifies against
 *    MongoDB that no other systemUser exists. If one exists, rejects with Security Error.
 */
userSchema.pre("save", async function () {
    // 1. Password hashing
    if (this.isModified("password")) {
        this.password = await bcrypt.hash(this.password, 10);
    }

    // 2. Reject modifying systemUser on an existing document
    if (!this.isNew && this.isModified("systemUser")) {
        throw new Error("Security Error: Modification of 'systemUser' field is strictly prohibited.");
    }

    // 3. Verify single System User rule in MongoDB
    if (this.systemUser === true) {
        const query = { systemUser: true };
        if (!this.isNew) {
            query._id = { $ne: this._id };
        }
        const existingSystemUser = await mongoose.model("user").findOne(query);
        if (existingSystemUser) {
            throw new Error(
                "Security Error: A System User already exists in the system. Only one System User is allowed."
            );
        }
    }
});

/**
 * Pre-update Hooks:
 * Intercepts all query update operations (updateOne, updateMany, findOneAndUpdate, replaceOne, etc.)
 * to reject any query that attempts to modify the 'systemUser' field.
 */
function preventSystemUserQueryModification() {
    const update = this.getUpdate();
    if (!update) return;

    const containsSystemUser = (target) => {
        if (!target || typeof target !== "object") return false;
        return Object.keys(target).some(
            (key) => key === "systemUser" || key.startsWith("systemUser.")
        );
    };

    // 1. Direct fields or replacement document
    if (containsSystemUser(update)) {
        throw new Error(
            "Security Error: Direct modification of 'systemUser' field is strictly prohibited."
        );
    }

    // 2. MongoDB update operators ($set, $unset, $setOnInsert, $inc, $rename, etc.)
    const operators = ["$set", "$unset", "$setOnInsert", "$inc", "$rename"];
    for (const op of operators) {
        if (update[op] && containsSystemUser(update[op])) {
            throw new Error(
                `Security Error: Modification of 'systemUser' field via operator '${op}' is strictly prohibited.`
            );
        }
    }

    // 3. Aggregation update pipeline format: [ { $set: ... } ]
    if (Array.isArray(update)) {
        for (const stage of update) {
            if (stage && typeof stage === "object") {
                for (const stageValue of Object.values(stage)) {
                    if (containsSystemUser(stageValue)) {
                        throw new Error(
                            "Security Error: Modification of 'systemUser' field via aggregation pipeline is strictly prohibited."
                        );
                    }
                }
            }
        }
    }
}

const updateHooks = [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace"
];

updateHooks.forEach((hook) => {
    userSchema.pre(hook, preventSystemUserQueryModification);
});

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

const User = mongoose.models.user || mongoose.model("user", userSchema);

// Register alias for 'User' to ensure ref: 'User' populates seamlessly
if (!mongoose.models.User) {
    mongoose.model("User", userSchema);
}

export default User;