import { NextResponse } from 'next/server'
export async function POST(req: Request){
  const body = await req.json().catch(()=>({}))
  const amount = body.amount || 38628
  const ref = body.ref || 'ARS-2026-'+Date.now().toString().slice(-6)
  const bypass = process.env.NEXT_PUBLIC_BYPASS_DPO_FOR_DEV === 'true'
  if(bypass){
    const mockToken = 'mock_'+Date.now()
    return NextResponse.json({Result:'000', ResultExplanation:'Bypass dev - no upstream', TransToken: mockToken, hostedUrl: 'https://secure.3gdirectpay.com/payv3.php?ID='+mockToken, CompanyRef: ref, amount: amount, currency:'BWP'})
  }
  return NextResponse.json({Result:'902', ResultExplanation:'Real DPO path is not configured in this mock endpoint'}, {status:401})
}
