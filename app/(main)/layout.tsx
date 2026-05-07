import MainHeader from "@/components/common/MainHeader";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="min-h-screen">
            <MainHeader />
            <div className="mx-auto w-full max-w-5xl">
                <main>{children}</main>
            </div>
        </div>
    );
}

