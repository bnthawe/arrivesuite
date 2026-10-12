import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function HomePage() {
  return (
    <main className='min-h-screen bg-slate-50'>
      <div className='container mx-auto max-w-4xl px-4 py-16'>
        <div className='mb-8 flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 font-bold text-white'>
            A
          </div>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>ArriveSuite</h1>
            <p className='text-sm text-slate-500'>
              National digital inventory layer for Botswana tourism
            </p>
          </div>
          <Badge variant='outline' className='ml-auto'>
            Phase 0 Day 1
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Environment is running</CardTitle>
            <CardDescription>
              Postgres + PostGIS, Redis, MinIO, MailHog, and Next.js are all up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 gap-3'>
              <a href='http://localhost:9001' target='_blank' rel='noopener noreferrer'>
                <Button variant='outline' className='w-full'>MinIO Console</Button>
              </a>
              <a href='http://localhost:8025' target='_blank' rel='noopener noreferrer'>
                <Button variant='outline' className='w-full'>MailHog</Button>
              </a>
              <a href='http://localhost:8080' target='_blank' rel='noopener noreferrer'>
                <Button variant='outline' className='w-full'>Adminer</Button>
              </a>
              <a href='http://localhost:3000/api/health' target='_blank' rel='noopener noreferrer'>
                <Button variant='outline' className='w-full'>Health</Button>
              </a>
              <a href='/search'>
                <Button className='w-full'>Search stays &amp; flights</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
