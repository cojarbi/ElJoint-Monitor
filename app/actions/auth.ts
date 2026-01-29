"use server"

import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { redirect } from "next/navigation"

const RegisterSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
})

export async function registerUser(formData: FormData) {
    const data = Object.fromEntries(formData.entries())
    const parsed = RegisterSchema.safeParse(data)

    if (!parsed.success) {
        return { error: "Invalid input data" }
    }

    const { name, email, password } = parsed.data

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
        where: { email },
    })

    if (existingUser) {
        return { error: "User already exists" }
    }

    // Check total user count to determine role and status
    const userCount = await prisma.user.count()
    const isFirstUser = userCount === 0

    const role = isFirstUser ? "ADMIN" : "USER"
    const status = isFirstUser ? "ACTIVE" : "PENDING"

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            role,
            status,
        },
    })

    return { success: true }
}
