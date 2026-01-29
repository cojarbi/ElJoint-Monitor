"use client"

import { ColumnDef } from "@tanstack/react-table"
import { UserFormValues } from "@/lib/schema"
import { UserCellAction } from "./user-cell-action"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"

export const columns: ColumnDef<UserFormValues>[] = [
    {
        accessorKey: "name",
        header: ({ column }) => {
            return (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
    },
    {
        accessorKey: "email",
        header: "Email",
    },
    {
        accessorKey: "role",
        header: "Role",
    },
    {
        accessorKey: "status",
        header: "Status",
    },
    {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => {
            // @ts-ignore
            const date = row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : "-"
            return <div>{date}</div>
        }
    },
    {
        id: "actions",
        cell: ({ row }) => <UserCellAction data={row.original} />,
    },
]
