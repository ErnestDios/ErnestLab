/* Ernest Lab · exr/worker.js · decodes one OpenEXR file off the main thread (module worker, created per file).
   In:  {buf: ArrayBuffer, layer: string|null, maxTex: number}
   Out: {w, h, data: Uint16Array RGBA half floats (row 0 = top), info} or {error}
   Colour stays as stored (scene-linear, the file's own primaries); the app converts with a 3×3 matrix on the GPU.
   NaN and ±Inf → 0, so one broken pixel can't bloom through halation or poison the blurs. Alpha is passed through but not used: EXR
   colour is premultiplied, i.e. already "over black", so Ernest Lab never divides by alpha. */
import { EXRLoader } from './EXRLoader.js';
import { HalfFloatType, DataUtils } from './three-shim.js';

self.onmessage = ( ev ) => {
	const { buf, layer, maxTex } = ev.data;
	try {
		const L = new EXRLoader(); L.setDataType( HalfFloatType ); L.layer = layer ?? null;
		const r = L.parse( buf );
		let w = r.width, h = r.height, d = r.data;
		{ const row = w * 4, tmp = new Uint16Array( row );   // the loader returns rows bottom-up (GL); the app wants row 0 = top
			for ( let y = 0; y < h >> 1; y ++ ) { const a = y * row, b = ( h - 1 - y ) * row; tmp.set( d.subarray( a, a + row ) ); d.copyWithin( a, b, b + row ); d.set( tmp, b ); } }
		for ( let i = 0; i < d.length; i ++ ) if ( ( d[ i ] & 0x7c00 ) === 0x7c00 ) d[ i ] = 0;   // NaN and ±Inf → 0, like Nuke's Remove NaN/Inf
		let scale = 1;
		while ( Math.max( w, h ) > maxTex ) {   // 2×2 box down until the GPU can hold it
			const W = w >> 1, H = h >> 1, o = new Uint16Array( W * H * 4 ), f = DataUtils.fromHalfFloat, t = DataUtils.toHalfFloat;
			for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W; x ++ ) for ( let c = 0; c < 4; c ++ ) {
				const a = ( ( 2 * y ) * w + 2 * x ) * 4 + c, b = a + w * 4;
				o[ ( y * W + x ) * 4 + c ] = t( ( f( d[ a ] ) + f( d[ a + 4 ] ) + f( d[ b ] ) + f( d[ b + 4 ] ) ) / 4 );
			}
			w = W; h = H; d = o; scale *= 2;
		}
		const H0 = r.header, ch = H0.chromaticities;
		const info = { compression: H0.compression, channels: H0.channels.map( c => c.name ), layers: H0.layers || [], layer: H0.layer ?? null,
			chromaticities: ch ? [ ch.redX, ch.redY, ch.greenX, ch.greenY, ch.blueX, ch.blueY, ch.whiteX, ch.whiteY ] : null,
			aces: H0.acesImageContainerFlag ?? null, pixelType: r.header.channels.find( c => c.name === 'R' )?.pixelType ?? null,
			parts: r.header.parts ?? null, scale, srcW: r.width, srcH: r.height };
		self.postMessage( { w, h, data: d, info }, [ d.buffer ] );
	} catch ( e ) { self.postMessage( { error: String( e && e.message || e ) } ); }
};
