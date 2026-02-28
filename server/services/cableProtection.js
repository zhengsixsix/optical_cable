/**
 * 海缆保护策略自动推荐服务
 *
 * 根据水深、海底地形和外部威胁等因素，自动推荐:
 *   - 铠装类型 (DA/RA/SA/LW/LWP)
 *   - 埋深要求 (m)
 *   - 保护方式 (铠装/埋设/铺盖/裸缆)
 */

/**
 * 铠装推荐规则表
 * 来源: ITU-T G.978, ICPC Recommendation No. 1
 */
const PROTECTION_RULES = [
    {
        depthRange: [0, 15],
        armorType: 'DA',
        armorName: '双铠装 (DA)',
        burial: 1.5,
        protectionMethod: '埋设+铠装',
        reason: '浅水/近岸区域，锚害、渔业活动、波浪冲刷风险极高',
    },
    {
        depthRange: [15, 50],
        armorType: 'DA',
        armorName: '双铠装 (DA)',
        burial: 1.2,
        protectionMethod: '埋设+铠装',
        reason: '近岸浅水区，渔业拖网和锚害风险高',
    },
    {
        depthRange: [50, 200],
        armorType: 'RA',
        armorName: '岩石铠装 (RA)',
        burial: 1.0,
        protectionMethod: '铠装+局部埋设',
        reason: '大陆架区域，需防范底拖网和锚害',
    },
    {
        depthRange: [200, 500],
        armorType: 'SA',
        armorName: '单铠装 (SA)',
        burial: 0.6,
        protectionMethod: '铠装',
        reason: '大陆坡上段，风险中等',
    },
    {
        depthRange: [500, 1000],
        armorType: 'SA',
        armorName: '单铠装 (SA)',
        burial: 0,
        protectionMethod: '铠装',
        reason: '大陆坡中段，人类活动减少',
    },
    {
        depthRange: [1000, 1500],
        armorType: 'LWP',
        armorName: '轻型保护 (LWP)',
        burial: 0,
        protectionMethod: '轻型保护',
        reason: '大陆坡下段，海底环境较稳定',
    },
    {
        depthRange: [1500, 6000],
        armorType: 'LW',
        armorName: '轻型 (LW)',
        burial: 0,
        protectionMethod: '裸缆',
        reason: '深海区域，外部威胁极低',
    },
    {
        depthRange: [6000, Infinity],
        armorType: 'LW',
        armorName: '轻型 (LW)',
        burial: 0,
        protectionMethod: '裸缆（加强型）',
        reason: '超深海区域，需考虑高静水压力',
    },
]

/**
 * 坡度修正因子
 * 陡坡区域可能需要更强的铠装来防止滑移
 */
const SLOPE_CORRECTIONS = {
    // slopeAngle (degrees) → armorUpgrade
    thresholds: [
        { angle: 15, upgrade: 1 },  // ≥15° 提升一级铠装
        { angle: 30, upgrade: 2 },  // ≥30° 提升两级铠装
    ],
}

// 铠装强度等级排序（从低到高）
const ARMOR_STRENGTH_ORDER = ['LW', 'LWP', 'SA', 'RA', 'DA']

/**
 * 根据水深推荐保护策略
 * @param {number} depthM - 水深（米，正值），0 表示岸上
 * @param {Object} [options]
 * @param {number} [options.slopeAngle] - 海底坡度（度）
 * @param {boolean} [options.nearShore] - 是否靠近海岸线
 * @param {boolean} [options.fishingArea] - 是否在渔业活动区
 * @returns {Object} 推荐结果
 */
export function recommendProtection(depthM, options = {}) {
    const { slopeAngle = 0, nearShore = false, fishingArea = false } = options
    const depth = Math.abs(depthM)

    // 查找基础规则
    let rule = PROTECTION_RULES.find(r =>
        depth >= r.depthRange[0] && depth < r.depthRange[1]
    )
    if (!rule) {
        rule = PROTECTION_RULES[PROTECTION_RULES.length - 1]
    }

    let { armorType, armorName, burial, protectionMethod, reason } = rule

    // 坡度修正
    if (slopeAngle > 0) {
        for (const corr of SLOPE_CORRECTIONS.thresholds) {
            if (slopeAngle >= corr.angle) {
                const currentIdx = ARMOR_STRENGTH_ORDER.indexOf(armorType)
                const newIdx = Math.min(currentIdx + corr.upgrade, ARMOR_STRENGTH_ORDER.length - 1)
                if (newIdx > currentIdx) {
                    armorType = ARMOR_STRENGTH_ORDER[newIdx]
                    armorName = _getArmorName(armorType)
                    reason += `；坡度 ${slopeAngle.toFixed(1)}° 触发铠装升级`
                }
            }
        }
    }

    // 近岸/渔区修正
    if ((nearShore || fishingArea) && ARMOR_STRENGTH_ORDER.indexOf(armorType) < ARMOR_STRENGTH_ORDER.indexOf('SA')) {
        armorType = 'SA'
        armorName = _getArmorName(armorType)
        burial = Math.max(burial, 0.8)
        reason += '；近岸/渔区提升保护等级'
    }

    return {
        armorType,
        armorName,
        burial,
        protectionMethod,
        reason,
        depth,
        depthRange: rule.depthRange,
    }
}

/**
 * 为整条路由的海缆段批量推荐保护策略
 * @param {Array} segments - [{ id, startPoint, endPoint, depth, length, ...}]
 * @returns {Array} 带有 protection 属性的分段
 */
export function recommendForRoute(segments) {
    return segments.map(seg => {
        const protection = recommendProtection(seg.depth || 0, {
            slopeAngle: seg.slopeAngle || 0,
        })
        return {
            ...seg,
            protection,
            cableType: protection.armorType,
        }
    })
}

function _getArmorName(type) {
    const names = {
        'DA': '双铠装 (DA)',
        'RA': '岩石铠装 (RA)',
        'SA': '单铠装 (SA)',
        'LWP': '轻型保护 (LWP)',
        'LW': '轻型 (LW)',
    }
    return names[type] || type
}
