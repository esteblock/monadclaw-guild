import Header from '@/components/Header';
import Chatbox from '@/components/Chatbox';

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Header />
      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-3xl mx-auto">
          <Chatbox />
        </div>
      </main>
    </div>
  );
}
