/**
 * 纯 JS Radix-2 Cooley-Tukey FFT
 * 支持长度为 2^N 的序列 (典型: 4096, 8192, 16384)
 * 就地计算 (in-place)，避免内存分配
 */

/**
 * 位反转置换 (bit-reversal permutation)
 * @param {Float64Array} re - 实部
 * @param {Float64Array} im - 虚部
 */
function bitReverse(re, im) {
    const n = re.length
    let j = 0
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            let tmp = re[i]; re[i] = re[j]; re[j] = tmp
            tmp = im[i]; im[i] = im[j]; im[j] = tmp
        }
        let k = n >> 1
        while (k <= j) {
            j -= k
            k >>= 1
        }
        j += k
    }
}

/**
 * 就地 FFT (Cooley-Tukey, decimation-in-time)
 * @param {Float64Array} re - 实部 (长度必须为 2^N)
 * @param {Float64Array} im - 虚部
 * @param {boolean} inverse - true 为 IFFT
 */
function fftCore(re, im, inverse) {
    const n = re.length
    bitReverse(re, im)

    const sign = inverse ? 1 : -1

    for (let size = 2; size <= n; size *= 2) {
        const halfSize = size >> 1
        const angle = sign * 2 * Math.PI / size

        // 预计算旋转因子
        const wRe = Math.cos(angle)
        const wIm = Math.sin(angle)

        for (let i = 0; i < n; i += size) {
            let curRe = 1
            let curIm = 0

            for (let j = 0; j < halfSize; j++) {
                const evenIdx = i + j
                const oddIdx = i + j + halfSize

                const tRe = curRe * re[oddIdx] - curIm * im[oddIdx]
                const tIm = curRe * im[oddIdx] + curIm * re[oddIdx]

                re[oddIdx] = re[evenIdx] - tRe
                im[oddIdx] = im[evenIdx] - tIm
                re[evenIdx] += tRe
                im[evenIdx] += tIm

                const nextRe = curRe * wRe - curIm * wIm
                const nextIm = curRe * wIm + curIm * wRe
                curRe = nextRe
                curIm = nextIm
            }
        }
    }

    if (inverse) {
        for (let i = 0; i < n; i++) {
            re[i] /= n
            im[i] /= n
        }
    }
}

/**
 * 正向 FFT (就地)
 * @param {Float64Array} re
 * @param {Float64Array} im
 */
export function fft(re, im) {
    fftCore(re, im, false)
}

/**
 * 逆 FFT (就地)
 * @param {Float64Array} re
 * @param {Float64Array} im
 */
export function ifft(re, im) {
    fftCore(re, im, true)
}

/**
 * FFT shift: 将零频分量移到中心
 * @param {Float64Array} arr
 */
export function fftshift(arr) {
    const n = arr.length
    const half = n >> 1
    for (let i = 0; i < half; i++) {
        const tmp = arr[i]
        arr[i] = arr[i + half]
        arr[i + half] = tmp
    }
}

/**
 * 返回 >= n 的最小 2 的幂
 * @param {number} n
 * @returns {number}
 */
export function nextPow2(n) {
    let p = 1
    while (p < n) p <<= 1
    return p
}
