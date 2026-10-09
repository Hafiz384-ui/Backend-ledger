import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
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
        select: false,
    },
    systemUser: {
      type: Boolean,
      default: false,
      immutable: true,
      select: false
    }
}, {timestamps: true})

userSchema.pre("save", async function(){
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
})

userSchema.methods.comparePassword = async function(password){
  return await bcrypt.compare(password, this.password);
}


const User = mongoose.model("user", userSchema);
export default User;