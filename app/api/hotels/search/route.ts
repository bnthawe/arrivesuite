import { NextResponse } from 'next/server'
export async function GET(){ return NextResponse.json({hotels:[{id:'xigera', name:'Xigera Safari Lodge', net:12500, retail:14375, commission:1875, trust:85, offerId:'r-abc123'}]}) }
