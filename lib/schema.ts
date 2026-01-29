import { z } from "zod"

export const UserSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().optional(), // Optional for update, required for create (handled in logic)
    role: z.enum(["USER", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
})

export type UserFormValues = z.infer<typeof UserSchema>
