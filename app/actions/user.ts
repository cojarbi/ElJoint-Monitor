"use server"

import { prisma } from "@/lib/prisma"
import { UserSchema } from "@/lib/schema"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export async function getUsers() {
    return await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
    })
}

export async function createUser(data: any) {
    const parsed = UserSchema.parse(data)

    if (!parsed.password) {
        throw new Error("Password is required")
    }

    const hashedPassword = await bcrypt.hash(parsed.password, 10)

    await prisma.user.create({
        data: {
            ...parsed,
            password: hashedPassword,
        },
    })

    revalidatePath("/settings")
    return { success: true }
}

export async function updateUser(id: string, data: any) {
    const parsed = UserSchema.parse(data)

    const updateData: any = { ...parsed }
    delete updateData.id
    if (!updateData.password) {
        delete updateData.password
    } else {
        updateData.password = await bcrypt.hash(updateData.password, 10)
    }

    await prisma.user.update({
        where: { id },
        data: updateData,
    })

    revalidatePath("/settings")
    return { success: true }
}

export async function deleteUser(id: string) {
    await prisma.user.delete({
        where: { id },
    })

    revalidatePath("/settings")
    return { success: true }
}
