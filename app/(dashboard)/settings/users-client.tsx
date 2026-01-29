"use client"

import { Button } from "@/components/ui/button"
import { DataTable } from "./data-table"
import { columns } from "./columns"
import { Plus } from "lucide-react"
import { useState } from "react"
import { UserDialog } from "./user-dialog"

interface UsersClientProps {
    data: any[]
}

export function UsersClient({ data }: UsersClientProps) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Users ({data.length})</h2>
                <Button onClick={() => setOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add New
                </Button>
            </div>
            <DataTable columns={columns} data={data} />
            <UserDialog
                open={open}
                onOpenChange={setOpen}
                user={null}
            />
        </>
    )
}
