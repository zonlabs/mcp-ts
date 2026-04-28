import MainHeader from "@/components/common/MainHeader";
import { createClient } from "@/lib/supabase/server";
import AuthProvider from "@/components/providers/AuthProvider";

export default async function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {

    const supabase = await createClient();
    const { data: { user }} = await supabase.auth.getUser();
    const { data: { session }} = await supabase.auth.getSession();

    let userSession = (user && session) ? session as any : null;
    if (userSession) {
        const data = await supabase.from('user_roles').select('role').eq('user_id', userSession.user.id).single();
        userSession = {
            ...userSession,
            role: data.data?.role || 'user',
        };
    }
    return (
        <AuthProvider userSession={userSession}>
            <div className="min-h-screen">
                <MainHeader />
                <div className="mx-auto w-full max-w-5xl">
                    <main>{children}</main>
                </div>
            </div>
        </AuthProvider>
    );
}

