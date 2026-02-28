/**
 * 物理常量 & 单位转换
 */

export const PHYS = {
    h: 6.62607015e-34,   // 普朗克常量 (J·s)
    c: 299792458,         // 光速 (m/s)
    refBandwidth: 12.5e9, // 参考带宽 0.1nm → Hz @1550nm
}

/**
 * dBm 转 W
 */
export function dbmToW(dbm) {
    return Math.pow(10, dbm / 10) / 1000
}

/**
 * W 转 dBm
 */
export function wToDbm(w) {
    return 10 * Math.log10(w * 1000)
}

/**
 * dB 转线性
 */
export function dbToLinear(db) {
    return Math.pow(10, db / 10)
}

/**
 * 线性转 dB
 */
export function linearToDb(linear) {
    return 10 * Math.log10(linear)
}
