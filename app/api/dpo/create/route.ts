import { NextResponse } from 'next/server'
export async function POST(req: Request){
  const body = await req.json().catch(()=>({}))
  const amount = body.amount || 38628
  const ref = body.ref || 'ARS-2026-'+Date.now().toString().slice(-6)
  const bypass = process.env.NEXT_PUBLIC_BYPASS_DPO_FOR_DEV === 'true'
  if(bypass){
    const mockToken = 'mock_'+Date.now()
    return NextResponse.json({Result:'000', ResultExplanation:'Bypass dev - no upstream', TransToken: mockToken, hostedUrl: 'https://secure.3gdirectpay.com/payv3.php?ID='+mockToken, CompanyRef: ref, amount: amount, currency:'BWP', testCards:{mc:'5436 8862 6984 8367', visa:'4012 8888 8888 1881'}})
  }
  return NextResponse.json({Result:'902', ResultExplanation:'Real DPO check B3F59BE7 service 54841'}, {status:401})
}
