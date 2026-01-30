import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getUsers } from "@/app/actions/user"
import { UsersClient } from "./users-client"
import { AiSettingsCard } from "@/components/settings/ai-settings-card"

export default async function SettingsPage() {
    const users = await getUsers()

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
            </div>
            <Tabs defaultValue="users" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="users">Users</TabsTrigger>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="billing">Billing</TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="space-y-4">
                    <UsersClient data={users} />
                </TabsContent>
                <TabsContent value="general" className="space-y-4">
                    <AiSettingsCard />
                </TabsContent>
                <TabsContent value="billing" className="space-y-4">
                    <div className="h-[200px] flex items-center justify-center border rounded-md">Billing Settings (Coming Soon)</div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
