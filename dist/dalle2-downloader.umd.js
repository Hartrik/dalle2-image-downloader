(function (global, factory) {
   typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
   typeof define === 'function' && define.amd ? define(['exports'], factory) :
   (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.Downloader = {}));
})(this, (function (exports) { 'use strict';

   // DEFLATE is a complex format; to read this code, you should probably check the RFC first:

   // aliases for shorter compressed code (most minifers don't do this)
   var u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array;
   // fixed length extra bits
   var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
   // fixed distance extra bits
   // see fleb note
   var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
   // code length index map
   var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
   // get base, reverse index map from extra bits
   var freb = function (eb, start) {
       var b = new u16(31);
       for (var i = 0; i < 31; ++i) {
           b[i] = start += 1 << eb[i - 1];
       }
       // numbers here are at max 18 bits
       var r = new u32(b[30]);
       for (var i = 1; i < 30; ++i) {
           for (var j = b[i]; j < b[i + 1]; ++j) {
               r[j] = ((j - b[i]) << 5) | i;
           }
       }
       return [b, r];
   };
   var _a = freb(fleb, 2), fl = _a[0], revfl = _a[1];
   // we can ignore the fact that the other numbers are wrong; they never happen anyway
   fl[28] = 258, revfl[258] = 28;
   var _b = freb(fdeb, 0), revfd = _b[1];
   // map of value to reverse (assuming 16 bits)
   var rev = new u16(32768);
   for (var i = 0; i < 32768; ++i) {
       // reverse table algorithm from SO
       var x = ((i & 0xAAAA) >>> 1) | ((i & 0x5555) << 1);
       x = ((x & 0xCCCC) >>> 2) | ((x & 0x3333) << 2);
       x = ((x & 0xF0F0) >>> 4) | ((x & 0x0F0F) << 4);
       rev[i] = (((x & 0xFF00) >>> 8) | ((x & 0x00FF) << 8)) >>> 1;
   }
   // create huffman tree from u8 "map": index -> code length for code index
   // mb (max bits) must be at most 15
   // TODO: optimize/split up?
   var hMap = (function (cd, mb, r) {
       var s = cd.length;
       // index
       var i = 0;
       // u16 "map": index -> # of codes with bit length = index
       var l = new u16(mb);
       // length of cd must be 288 (total # of codes)
       for (; i < s; ++i) {
           if (cd[i])
               ++l[cd[i] - 1];
       }
       // u16 "map": index -> minimum code for bit length = index
       var le = new u16(mb);
       for (i = 0; i < mb; ++i) {
           le[i] = (le[i - 1] + l[i - 1]) << 1;
       }
       var co;
       if (r) {
           // u16 "map": index -> number of actual bits, symbol for code
           co = new u16(1 << mb);
           // bits to remove for reverser
           var rvb = 15 - mb;
           for (i = 0; i < s; ++i) {
               // ignore 0 lengths
               if (cd[i]) {
                   // num encoding both symbol and bits read
                   var sv = (i << 4) | cd[i];
                   // free bits
                   var r_1 = mb - cd[i];
                   // start value
                   var v = le[cd[i] - 1]++ << r_1;
                   // m is end value
                   for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                       // every 16 bit value starting with the code yields the same result
                       co[rev[v] >>> rvb] = sv;
                   }
               }
           }
       }
       else {
           co = new u16(s);
           for (i = 0; i < s; ++i) {
               if (cd[i]) {
                   co[i] = rev[le[cd[i] - 1]++] >>> (15 - cd[i]);
               }
           }
       }
       return co;
   });
   // fixed length tree
   var flt = new u8(288);
   for (var i = 0; i < 144; ++i)
       flt[i] = 8;
   for (var i = 144; i < 256; ++i)
       flt[i] = 9;
   for (var i = 256; i < 280; ++i)
       flt[i] = 7;
   for (var i = 280; i < 288; ++i)
       flt[i] = 8;
   // fixed distance tree
   var fdt = new u8(32);
   for (var i = 0; i < 32; ++i)
       fdt[i] = 5;
   // fixed length map
   var flm = /*#__PURE__*/ hMap(flt, 9, 0);
   // fixed distance map
   var fdm = /*#__PURE__*/ hMap(fdt, 5, 0);
   // get end of byte
   var shft = function (p) { return ((p + 7) / 8) | 0; };
   // typed array slice - allows garbage collector to free original reference,
   // while being more compatible than .slice
   var slc = function (v, s, e) {
       if (s == null || s < 0)
           s = 0;
       if (e == null || e > v.length)
           e = v.length;
       // can't use .constructor in case user-supplied
       var n = new (v.BYTES_PER_ELEMENT == 2 ? u16 : v.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
       n.set(v.subarray(s, e));
       return n;
   };
   // error codes
   var ec = [
       'unexpected EOF',
       'invalid block type',
       'invalid length/literal',
       'invalid distance',
       'stream finished',
       'no stream handler',
       ,
       'no callback',
       'invalid UTF-8 data',
       'extra field too long',
       'date not in range 1980-2099',
       'filename too long',
       'stream finishing',
       'invalid zip data'
       // determined by unknown compression method
   ];
   var err = function (ind, msg, nt) {
       var e = new Error(msg || ec[ind]);
       e.code = ind;
       if (Error.captureStackTrace)
           Error.captureStackTrace(e, err);
       if (!nt)
           throw e;
       return e;
   };
   // starting at p, write the minimum number of bits that can hold v to d
   var wbits = function (d, p, v) {
       v <<= p & 7;
       var o = (p / 8) | 0;
       d[o] |= v;
       d[o + 1] |= v >>> 8;
   };
   // starting at p, write the minimum number of bits (>8) that can hold v to d
   var wbits16 = function (d, p, v) {
       v <<= p & 7;
       var o = (p / 8) | 0;
       d[o] |= v;
       d[o + 1] |= v >>> 8;
       d[o + 2] |= v >>> 16;
   };
   // creates code lengths from a frequency table
   var hTree = function (d, mb) {
       // Need extra info to make a tree
       var t = [];
       for (var i = 0; i < d.length; ++i) {
           if (d[i])
               t.push({ s: i, f: d[i] });
       }
       var s = t.length;
       var t2 = t.slice();
       if (!s)
           return [et, 0];
       if (s == 1) {
           var v = new u8(t[0].s + 1);
           v[t[0].s] = 1;
           return [v, 1];
       }
       t.sort(function (a, b) { return a.f - b.f; });
       // after i2 reaches last ind, will be stopped
       // freq must be greater than largest possible number of symbols
       t.push({ s: -1, f: 25001 });
       var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
       t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
       // efficient algorithm from UZIP.js
       // i0 is lookbehind, i2 is lookahead - after processing two low-freq
       // symbols that combined have high freq, will start processing i2 (high-freq,
       // non-composite) symbols instead
       // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
       while (i1 != s - 1) {
           l = t[t[i0].f < t[i2].f ? i0++ : i2++];
           r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
           t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
       }
       var maxSym = t2[0].s;
       for (var i = 1; i < s; ++i) {
           if (t2[i].s > maxSym)
               maxSym = t2[i].s;
       }
       // code lengths
       var tr = new u16(maxSym + 1);
       // max bits in tree
       var mbt = ln(t[i1 - 1], tr, 0);
       if (mbt > mb) {
           // more algorithms from UZIP.js
           // TODO: find out how this code works (debt)
           //  ind    debt
           var i = 0, dt = 0;
           //    left            cost
           var lft = mbt - mb, cst = 1 << lft;
           t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
           for (; i < s; ++i) {
               var i2_1 = t2[i].s;
               if (tr[i2_1] > mb) {
                   dt += cst - (1 << (mbt - tr[i2_1]));
                   tr[i2_1] = mb;
               }
               else
                   break;
           }
           dt >>>= lft;
           while (dt > 0) {
               var i2_2 = t2[i].s;
               if (tr[i2_2] < mb)
                   dt -= 1 << (mb - tr[i2_2]++ - 1);
               else
                   ++i;
           }
           for (; i >= 0 && dt; --i) {
               var i2_3 = t2[i].s;
               if (tr[i2_3] == mb) {
                   --tr[i2_3];
                   ++dt;
               }
           }
           mbt = mb;
       }
       return [new u8(tr), mbt];
   };
   // get the max length and assign length codes
   var ln = function (n, l, d) {
       return n.s == -1
           ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
           : (l[n.s] = d);
   };
   // length codes generation
   var lc = function (c) {
       var s = c.length;
       // Note that the semicolon was intentional
       while (s && !c[--s])
           ;
       var cl = new u16(++s);
       //  ind      num         streak
       var cli = 0, cln = c[0], cls = 1;
       var w = function (v) { cl[cli++] = v; };
       for (var i = 1; i <= s; ++i) {
           if (c[i] == cln && i != s)
               ++cls;
           else {
               if (!cln && cls > 2) {
                   for (; cls > 138; cls -= 138)
                       w(32754);
                   if (cls > 2) {
                       w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                       cls = 0;
                   }
               }
               else if (cls > 3) {
                   w(cln), --cls;
                   for (; cls > 6; cls -= 6)
                       w(8304);
                   if (cls > 2)
                       w(((cls - 3) << 5) | 8208), cls = 0;
               }
               while (cls--)
                   w(cln);
               cls = 1;
               cln = c[i];
           }
       }
       return [cl.subarray(0, cli), s];
   };
   // calculate the length of output from tree, code lengths
   var clen = function (cf, cl) {
       var l = 0;
       for (var i = 0; i < cl.length; ++i)
           l += cf[i] * cl[i];
       return l;
   };
   // writes a fixed block
   // returns the new bit pos
   var wfblk = function (out, pos, dat) {
       // no need to write 00 as type: TypedArray defaults to 0
       var s = dat.length;
       var o = shft(pos + 2);
       out[o] = s & 255;
       out[o + 1] = s >>> 8;
       out[o + 2] = out[o] ^ 255;
       out[o + 3] = out[o + 1] ^ 255;
       for (var i = 0; i < s; ++i)
           out[o + i + 4] = dat[i];
       return (o + 4 + s) * 8;
   };
   // writes a block
   var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
       wbits(out, p++, final);
       ++lf[256];
       var _a = hTree(lf, 15), dlt = _a[0], mlb = _a[1];
       var _b = hTree(df, 15), ddt = _b[0], mdb = _b[1];
       var _c = lc(dlt), lclt = _c[0], nlc = _c[1];
       var _d = lc(ddt), lcdt = _d[0], ndc = _d[1];
       var lcfreq = new u16(19);
       for (var i = 0; i < lclt.length; ++i)
           lcfreq[lclt[i] & 31]++;
       for (var i = 0; i < lcdt.length; ++i)
           lcfreq[lcdt[i] & 31]++;
       var _e = hTree(lcfreq, 7), lct = _e[0], mlcb = _e[1];
       var nlcc = 19;
       for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
           ;
       var flen = (bl + 5) << 3;
       var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
       var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + (2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18]);
       if (flen <= ftlen && flen <= dtlen)
           return wfblk(out, p, dat.subarray(bs, bs + bl));
       var lm, ll, dm, dl;
       wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
       if (dtlen < ftlen) {
           lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
           var llm = hMap(lct, mlcb, 0);
           wbits(out, p, nlc - 257);
           wbits(out, p + 5, ndc - 1);
           wbits(out, p + 10, nlcc - 4);
           p += 14;
           for (var i = 0; i < nlcc; ++i)
               wbits(out, p + 3 * i, lct[clim[i]]);
           p += 3 * nlcc;
           var lcts = [lclt, lcdt];
           for (var it = 0; it < 2; ++it) {
               var clct = lcts[it];
               for (var i = 0; i < clct.length; ++i) {
                   var len = clct[i] & 31;
                   wbits(out, p, llm[len]), p += lct[len];
                   if (len > 15)
                       wbits(out, p, (clct[i] >>> 5) & 127), p += clct[i] >>> 12;
               }
           }
       }
       else {
           lm = flm, ll = flt, dm = fdm, dl = fdt;
       }
       for (var i = 0; i < li; ++i) {
           if (syms[i] > 255) {
               var len = (syms[i] >>> 18) & 31;
               wbits16(out, p, lm[len + 257]), p += ll[len + 257];
               if (len > 7)
                   wbits(out, p, (syms[i] >>> 23) & 31), p += fleb[len];
               var dst = syms[i] & 31;
               wbits16(out, p, dm[dst]), p += dl[dst];
               if (dst > 3)
                   wbits16(out, p, (syms[i] >>> 5) & 8191), p += fdeb[dst];
           }
           else {
               wbits16(out, p, lm[syms[i]]), p += ll[syms[i]];
           }
       }
       wbits16(out, p, lm[256]);
       return p + ll[256];
   };
   // deflate options (nice << 13) | chain
   var deo = /*#__PURE__*/ new u32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
   // empty
   var et = /*#__PURE__*/ new u8(0);
   // compresses data into a raw DEFLATE buffer
   var dflt = function (dat, lvl, plvl, pre, post, lst) {
       var s = dat.length;
       var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
       // writing to this writes to the output buffer
       var w = o.subarray(pre, o.length - post);
       var pos = 0;
       if (!lvl || s < 8) {
           for (var i = 0; i <= s; i += 65535) {
               // end
               var e = i + 65535;
               if (e >= s) {
                   // write final block
                   w[pos >> 3] = lst;
               }
               pos = wfblk(w, pos + 1, dat.subarray(i, e));
           }
       }
       else {
           var opt = deo[lvl - 1];
           var n = opt >>> 13, c = opt & 8191;
           var msk_1 = (1 << plvl) - 1;
           //    prev 2-byte val map    curr 2-byte val map
           var prev = new u16(32768), head = new u16(msk_1 + 1);
           var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
           var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
           // 24576 is an arbitrary number of maximum symbols per block
           // 424 buffer for last block
           var syms = new u32(25000);
           // length/literal freq   distance freq
           var lf = new u16(288), df = new u16(32);
           //  l/lcnt  exbits  index  l/lind  waitdx  bitpos
           var lc_1 = 0, eb = 0, i = 0, li = 0, wi = 0, bs = 0;
           for (; i < s; ++i) {
               // hash value
               // deopt when i > s - 3 - at end, deopt acceptable
               var hv = hsh(i);
               // index mod 32768    previous index mod
               var imod = i & 32767, pimod = head[hv];
               prev[imod] = pimod;
               head[hv] = imod;
               // We always should modify head and prev, but only add symbols if
               // this data is not yet processed ("wait" for wait index)
               if (wi <= i) {
                   // bytes remaining
                   var rem = s - i;
                   if ((lc_1 > 7000 || li > 24576) && rem > 423) {
                       pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                       li = lc_1 = eb = 0, bs = i;
                       for (var j = 0; j < 286; ++j)
                           lf[j] = 0;
                       for (var j = 0; j < 30; ++j)
                           df[j] = 0;
                   }
                   //  len    dist   chain
                   var l = 2, d = 0, ch_1 = c, dif = (imod - pimod) & 32767;
                   if (rem > 2 && hv == hsh(i - dif)) {
                       var maxn = Math.min(n, rem) - 1;
                       var maxd = Math.min(32767, i);
                       // max possible length
                       // not capped at dif because decompressors implement "rolling" index population
                       var ml = Math.min(258, rem);
                       while (dif <= maxd && --ch_1 && imod != pimod) {
                           if (dat[i + l] == dat[i + l - dif]) {
                               var nl = 0;
                               for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                   ;
                               if (nl > l) {
                                   l = nl, d = dif;
                                   // break out early when we reach "nice" (we are satisfied enough)
                                   if (nl > maxn)
                                       break;
                                   // now, find the rarest 2-byte sequence within this
                                   // length of literals and search for that instead.
                                   // Much faster than just using the start
                                   var mmd = Math.min(dif, nl - 2);
                                   var md = 0;
                                   for (var j = 0; j < mmd; ++j) {
                                       var ti = (i - dif + j + 32768) & 32767;
                                       var pti = prev[ti];
                                       var cd = (ti - pti + 32768) & 32767;
                                       if (cd > md)
                                           md = cd, pimod = ti;
                                   }
                               }
                           }
                           // check the previous match
                           imod = pimod, pimod = prev[imod];
                           dif += (imod - pimod + 32768) & 32767;
                       }
                   }
                   // d will be nonzero only when a match was found
                   if (d) {
                       // store both dist and len data in one Uint32
                       // Make sure this is recognized as a len/dist with 28th bit (2^28)
                       syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                       var lin = revfl[l] & 31, din = revfd[d] & 31;
                       eb += fleb[lin] + fdeb[din];
                       ++lf[257 + lin];
                       ++df[din];
                       wi = i + l;
                       ++lc_1;
                   }
                   else {
                       syms[li++] = dat[i];
                       ++lf[dat[i]];
                   }
               }
           }
           pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
           // this is the easiest way to avoid needing to maintain state
           if (!lst && pos & 7)
               pos = wfblk(w, pos + 1, et);
       }
       return slc(o, 0, pre + shft(pos) + post);
   };
   // CRC32 table
   var crct = /*#__PURE__*/ (function () {
       var t = new Int32Array(256);
       for (var i = 0; i < 256; ++i) {
           var c = i, k = 9;
           while (--k)
               c = ((c & 1) && -306674912) ^ (c >>> 1);
           t[i] = c;
       }
       return t;
   })();
   // CRC32
   var crc = function () {
       var c = -1;
       return {
           p: function (d) {
               // closures have awful performance
               var cr = c;
               for (var i = 0; i < d.length; ++i)
                   cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
               c = cr;
           },
           d: function () { return ~c; }
       };
   };
   // deflate with opts
   var dopt = function (dat, opt, pre, post, st) {
       return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : (12 + opt.mem), pre, post, !st);
   };
   // Walmart object spread
   var mrg = function (a, b) {
       var o = {};
       for (var k in a)
           o[k] = a[k];
       for (var k in b)
           o[k] = b[k];
       return o;
   };
   // write bytes
   var wbytes = function (d, b, v) {
       for (; v; ++b)
           d[b] = v, v >>>= 8;
   };
   /**
    * Compresses data with DEFLATE without any wrapper
    * @param data The data to compress
    * @param opts The compression options
    * @returns The deflated version of the data
    */
   function deflateSync(data, opts) {
       return dopt(data, opts || {}, 0, 0);
   }
   // flatten a directory structure
   var fltn = function (d, p, t, o) {
       for (var k in d) {
           var val = d[k], n = p + k, op = o;
           if (Array.isArray(val))
               op = mrg(o, val[1]), val = val[0];
           if (val instanceof u8)
               t[n] = [val, op];
           else {
               t[n += '/'] = [new u8(0), op];
               fltn(val, n, t, o);
           }
       }
   };
   // text encoder
   var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
   // text decoder
   var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
   // text decoder stream
   var tds = 0;
   try {
       td.decode(et, { stream: true });
       tds = 1;
   }
   catch (e) { }
   /**
    * Converts a string into a Uint8Array for use with compression/decompression methods
    * @param str The string to encode
    * @param latin1 Whether or not to interpret the data as Latin-1. This should
    *               not need to be true unless decoding a binary string.
    * @returns The string encoded in UTF-8/Latin-1 binary
    */
   function strToU8(str, latin1) {
       if (latin1) {
           var ar_1 = new u8(str.length);
           for (var i = 0; i < str.length; ++i)
               ar_1[i] = str.charCodeAt(i);
           return ar_1;
       }
       if (te)
           return te.encode(str);
       var l = str.length;
       var ar = new u8(str.length + (str.length >> 1));
       var ai = 0;
       var w = function (v) { ar[ai++] = v; };
       for (var i = 0; i < l; ++i) {
           if (ai + 5 > ar.length) {
               var n = new u8(ai + 8 + ((l - i) << 1));
               n.set(ar);
               ar = n;
           }
           var c = str.charCodeAt(i);
           if (c < 128 || latin1)
               w(c);
           else if (c < 2048)
               w(192 | (c >> 6)), w(128 | (c & 63));
           else if (c > 55295 && c < 57344)
               c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                   w(240 | (c >> 18)), w(128 | ((c >> 12) & 63)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
           else
               w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
       }
       return slc(ar, 0, ai);
   }
   // extra field length
   var exfl = function (ex) {
       var le = 0;
       if (ex) {
           for (var k in ex) {
               var l = ex[k].length;
               if (l > 65535)
                   err(9);
               le += l + 4;
           }
       }
       return le;
   };
   // write zip header
   var wzh = function (d, b, f, fn, u, c, ce, co) {
       var fl = fn.length, ex = f.extra, col = co && co.length;
       var exl = exfl(ex);
       wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50), b += 4;
       if (ce != null)
           d[b++] = 20, d[b++] = f.os;
       d[b] = 20, b += 2; // spec compliance? what's that?
       d[b++] = (f.flag << 1) | (c < 0 && 8), d[b++] = u && 8;
       d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
       var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
       if (y < 0 || y > 119)
           err(10);
       wbytes(d, b, (y << 25) | ((dt.getMonth() + 1) << 21) | (dt.getDate() << 16) | (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >>> 1)), b += 4;
       if (c != -1) {
           wbytes(d, b, f.crc);
           wbytes(d, b + 4, c < 0 ? -c - 2 : c);
           wbytes(d, b + 8, f.size);
       }
       wbytes(d, b + 12, fl);
       wbytes(d, b + 14, exl), b += 16;
       if (ce != null) {
           wbytes(d, b, col);
           wbytes(d, b + 6, f.attrs);
           wbytes(d, b + 10, ce), b += 14;
       }
       d.set(fn, b);
       b += fl;
       if (exl) {
           for (var k in ex) {
               var exf = ex[k], l = exf.length;
               wbytes(d, b, +k);
               wbytes(d, b + 2, l);
               d.set(exf, b + 4), b += 4 + l;
           }
       }
       if (col)
           d.set(co, b), b += col;
       return b;
   };
   // write zip footer (end of central directory)
   var wzf = function (o, b, c, d, e) {
       wbytes(o, b, 0x6054B50); // skip disk
       wbytes(o, b + 8, c);
       wbytes(o, b + 10, c);
       wbytes(o, b + 12, d);
       wbytes(o, b + 16, e);
   };
   /**
    * Synchronously creates a ZIP file. Prefer using `zip` for better performance
    * with more than one file.
    * @param data The directory structure for the ZIP archive
    * @param opts The main options, merged with per-file options
    * @returns The generated ZIP archive
    */
   function zipSync(data, opts) {
       if (!opts)
           opts = {};
       var r = {};
       var files = [];
       fltn(data, '', r, opts);
       var o = 0;
       var tot = 0;
       for (var fn in r) {
           var _a = r[fn], file = _a[0], p = _a[1];
           var compression = p.level == 0 ? 0 : 8;
           var f = strToU8(fn), s = f.length;
           var com = p.comment, m = com && strToU8(com), ms = m && m.length;
           var exl = exfl(p.extra);
           if (s > 65535)
               err(11);
           var d = compression ? deflateSync(file, p) : file, l = d.length;
           var c = crc();
           c.p(file);
           files.push(mrg(p, {
               size: file.length,
               crc: c.d(),
               c: d,
               f: f,
               m: m,
               u: s != fn.length || (m && (com.length != ms)),
               o: o,
               compression: compression
           }));
           o += 30 + s + exl + l;
           tot += 76 + 2 * (s + exl) + (ms || 0) + l;
       }
       var out = new u8(tot + 22), oe = o, cdl = tot - o;
       for (var i = 0; i < files.length; ++i) {
           var f = files[i];
           wzh(out, f.o, f, f.f, f.u, f.c.length);
           var badd = 30 + f.f.length + exfl(f.extra);
           out.set(f.c, f.o + badd);
           wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
       }
       wzf(out, o, files.length, cdl, oe);
       return out;
   }

   var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

   var FileSaver_minExports = {};
   var FileSaver_min = {
     get exports(){ return FileSaver_minExports; },
     set exports(v){ FileSaver_minExports = v; },
   };

   (function (module, exports) {
   	(function(a,b){b();})(commonjsGlobal,function(){function b(a,b){return "undefined"==typeof b?b={autoBom:!1}:"object"!=typeof b&&(console.warn("Deprecated: Expected third argument to be a object"),b={autoBom:!b}),b.autoBom&&/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(a.type)?new Blob(["\uFEFF",a],{type:a.type}):a}function c(a,b,c){var d=new XMLHttpRequest;d.open("GET",a),d.responseType="blob",d.onload=function(){g(d.response,b,c);},d.onerror=function(){console.error("could not download file");},d.send();}function d(a){var b=new XMLHttpRequest;b.open("HEAD",a,!1);try{b.send();}catch(a){}return 200<=b.status&&299>=b.status}function e(a){try{a.dispatchEvent(new MouseEvent("click"));}catch(c){var b=document.createEvent("MouseEvents");b.initMouseEvent("click",!0,!0,window,0,0,0,80,20,!1,!1,!1,!1,0,null),a.dispatchEvent(b);}}var f="object"==typeof window&&window.window===window?window:"object"==typeof self&&self.self===self?self:"object"==typeof commonjsGlobal&&commonjsGlobal.global===commonjsGlobal?commonjsGlobal:void 0,a=f.navigator&&/Macintosh/.test(navigator.userAgent)&&/AppleWebKit/.test(navigator.userAgent)&&!/Safari/.test(navigator.userAgent),g=f.saveAs||("object"!=typeof window||window!==f?function(){}:"download"in HTMLAnchorElement.prototype&&!a?function(b,g,h){var i=f.URL||f.webkitURL,j=document.createElement("a");g=g||b.name||"download",j.download=g,j.rel="noopener","string"==typeof b?(j.href=b,j.origin===location.origin?e(j):d(j.href)?c(b,g,h):e(j,j.target="_blank")):(j.href=i.createObjectURL(b),setTimeout(function(){i.revokeObjectURL(j.href);},4E4),setTimeout(function(){e(j);},0));}:"msSaveOrOpenBlob"in navigator?function(f,g,h){if(g=g||f.name||"download","string"!=typeof f)navigator.msSaveOrOpenBlob(b(f,h),g);else if(d(f))c(f,g,h);else {var i=document.createElement("a");i.href=f,i.target="_blank",setTimeout(function(){e(i);});}}:function(b,d,e,g){if(g=g||open("","_blank"),g&&(g.document.title=g.document.body.innerText="downloading..."),"string"==typeof b)return c(b,d,e);var h="application/octet-stream"===b.type,i=/constructor/i.test(f.HTMLElement)||f.safari,j=/CriOS\/[\d]+/.test(navigator.userAgent);if((j||h&&i||a)&&"undefined"!=typeof FileReader){var k=new FileReader;k.onloadend=function(){var a=k.result;a=j?a:a.replace(/^data:[^;]*;/,"data:attachment/file;"),g?g.location.href=a:location=a,g=null;},k.readAsDataURL(b);}else {var l=f.URL||f.webkitURL,m=l.createObjectURL(b);g?g.location=m:location.href=m,g=null,setTimeout(function(){l.revokeObjectURL(m);},4E4);}});f.saveAs=g.saveAs=g,(module.exports=g);});

   	
   } (FileSaver_min));

   var FileSaver = FileSaver_minExports;

   /**
    * Finds all generated images. Usage:
    * findImages((img, p) => { console.log(p); console.log(img) });
    *
    * @param handler {function(Element, string|null)}
    */
   function findImages(handler) {

       const containers = document.getElementsByClassName("image-prompt-overlay-container");
       for (let i = 0; i < containers.length; i++) {
           const container = containers[i];

           // find image
           let img = null;
           const generatedImageContainers = container.getElementsByClassName("generated-image");
           if (generatedImageContainers.length > 0) {
               const generatedImageContainer = generatedImageContainers[0];
               const image = generatedImageContainer.querySelector("img");
               if (image) {
                   img = image;
               }
           }

           // find prompt
           let prompt = null;
           const imagePromptOverlays = container.getElementsByClassName("image-prompt-overlay");
           if (imagePromptOverlays.length > 0) {
               const imagePromptOverlay = imagePromptOverlays[0];
               const h2 = imagePromptOverlay.querySelector("h4");
               if (h2) {
                   prompt = h2.textContent;
               }
           }

           if (!img) {
               console.log("Image not found in target container - there may be some changes in page structure");
           } else {
               handler(img, prompt);
           }
       }
   }

   function asData(img) {
       const canvas = document.createElement("canvas");
       canvas.width = 1024;
       canvas.height = 1024;
       const ctx = canvas.getContext("2d");
       ctx.drawImage(img, 0, 0);

       function dataURLtoBlob(dataurl) {
           let arr = dataurl.split(',');
           let bstr = atob(arr[1]);
           let n = bstr.length;
           let out = new Uint8Array(n);
           while (n--) {
               out[n] = bstr.charCodeAt(n);
           }
           return out;
       }

       let dataUrl = canvas.toDataURL('image/png');
       return dataURLtoBlob(dataUrl);
   }

   /**
    * Download all generated images.
    */
   function download() {
       let zipData = {};

       let i = 1;
       findImages((img, prompt) => {
           const id = String(i).padStart(3, '0');
           console.log(id + (prompt ? ' - ' + prompt : ''));

           zipData[id + '.png'] = asData(img);

           if (prompt) {
               zipData[id + '.txt'] = strToU8(prompt);
           }

           i++;
       });

       let bytes = zipSync(zipData, { level: 0 });
       FileSaver.saveAs(new Blob([bytes]), "images.zip");
   }

   download();

   exports.download = download;

   Object.defineProperty(exports, '__esModule', { value: true });

}));
