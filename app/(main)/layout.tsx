import MainHeader from "@/components/common/MainHeader";
import { createClient } from "@/lib/supabase/server";
import AuthProvider from "@/components/providers/AuthProvider";

export default async function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {

    const supabase = await createClient();
    const { data: { session }} = await supabase.auth.getSession();

    let userSession = null;
    if (session) {
        const data = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).single();
        userSession = {
            ...session,
            role: data.data?.role || 'user',
        };
    }
    return (
        <AuthProvider userSession={userSession}>
            <div className="min-h-screen">
                <div className="mx-auto max-w-5xl w-full">
                    <MainHeader />
                    <main>
                        {children}
                    </main>
                </div>
            </div>
        </AuthProvider>
    );
}

