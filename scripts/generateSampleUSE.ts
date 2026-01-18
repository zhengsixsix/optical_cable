/**
 * 生成完整示例 USE 文件
 * USE 文件格式为 ZIP 压缩包，包含：
 * - project_data.json: 核心逻辑数据
 * - cache/: 缓存目录
 */

import JSZip from 'jszip'
import * as fs from 'fs'
import * as path from 'path'

// 生成完整的示例项目数据
function generateSampleProjectData() {
  const now = new Date().toISOString()
  
  return {
    // ==================== 1. 元数据模块 ====================
    metadata: {
      file_format_version: "2.0",
      project_uuid: "550e8400-e29b-41d4-a716-446655440000",
      project_name: "上海-东京海缆系统规划工程",
      creator_user_id: "user-admin-001",
      resource_root_dir: "D:/SubseaCable/Assets/",
      allow_other_users: true,
      created_at: "2025-01-15T08:00:00Z",
      updated_at: now,
      display_settings: {
        crs: "EPSG:4326",
        units: { length: "km", depth: "m" }
      }
    },

    // ==================== 2. 环境上下文模块 ====================
    environment_context: {
      layer_registry: [
        {
          layer_id: "layer_bathy_001",
          name: "GEBCO 2024 全球水深图",
          file_format: "GeoTIFF",
          relative_path: "bathymetry/gebco_2024.tif",
          content_type: "BATHYMETRY",
          integrity: {
            checksum: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            size_bytes: 104857600
          }
        },
        {
          layer_id: "layer_fishing_001",
          name: "东海渔场分布",
          file_format: "Shapefile",
          relative_path: "hazards/east_china_fishing.shp",
          content_type: "FISHING",
          integrity: {
            checksum: "sha256:a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            size_bytes: 2048576
          }
        },
        {
          layer_id: "layer_earthquake_001",
          name: "环太平洋地震带",
          file_format: "GeoJSON",
          relative_path: "hazards/pacific_ring_earthquake.geojson",
          content_type: "EARTHQUAKE",
          integrity: {
            checksum: "sha256:b2c3d4e5f6a7890123456789012345678901bcdef2345678901bcdef2345678",
            size_bytes: 512000
          }
        }
      ],
      imported_landing_points: [
        {
          id: "site_shanghai_01",
          name: "上海崇明登陆站",
          coords: [121.5, 31.2],
          properties: {
            country: "CN",
            owner: "中国电信",
            capacity: "100Tbps"
          }
        },
        {
          id: "site_tokyo_01",
          name: "东京千叶登陆站",
          coords: [139.7, 35.6],
          properties: {
            country: "JP",
            owner: "NTT",
            capacity: "100Tbps"
          }
        }
      ]
    },

    // ==================== 3. 静态资源库模块 ====================
    libraries: {
      // 3.1 光纤参数库
      fibers: [
        {
          id: "fiber_g654e_001",
          fiber_type_id: "G.654.E",
          attributes: {
            attenuation: 0.16,
            A_eff: 110,
            dispersion: 2.1e-5,
            dispersion_slope: 60.0,
            n2: 2.6
          },
          supported_models: ["fiber_linear_loss", "fiber_gn_model", "fiber_egn_model"],
          model_params: {
            fiber_gn_model: {
              is_configured: true,
              params: {
                coherence_factor: 1.0,
                noise_bandwidth_ghz: 12.5
              }
            },
            fiber_egn_model: {
              is_configured: true,
              params: {
                phased_array_factor: 0.8,
                xpm_factor: 1.2
              }
            },
            fiber_linear_loss: {
              is_configured: true,
              params: {}
            }
          }
        },
        {
          id: "fiber_smf28_001",
          fiber_type_id: "SMF-28e+",
          attributes: {
            attenuation: 0.18,
            A_eff: 80,
            dispersion: 1.7e-5,
            dispersion_slope: 58.0,
            n2: 2.7
          },
          supported_models: ["fiber_linear_loss", "fiber_gn_model"],
          model_params: {
            fiber_gn_model: {
              is_configured: true,
              params: {
                coherence_factor: 1.0,
                noise_bandwidth_ghz: 12.5
              }
            },
            fiber_linear_loss: {
              is_configured: true,
              params: {}
            }
          }
        }
      ],

      // 3.2 海缆铠装类型库
      cable_types: [
        {
          id: "struct_lw_001",
          name: "Light Weight Cable",
          type: "LW",
          commercial_params: {
            price_per_km: 25000,
            currency: "USD"
          }
        },
        {
          id: "struct_sa_001",
          name: "Single Armor Cable",
          type: "SA",
          commercial_params: {
            price_per_km: 35000,
            currency: "USD"
          }
        },
        {
          id: "struct_da_001",
          name: "Double Armor Cable",
          type: "DA",
          commercial_params: {
            price_per_km: 50000,
            currency: "USD"
          }
        }
      ],

      // 3.3 器件规格库
      components: [
        {
          id: "edfa_std_cband_001",
          name: "Standard C-Band EDFA",
          type: "EDFA",
          specs: {
            gain_db: 20.0,
            bandwidth_nm: 35.0,
            noise_figure_db: 5.0,
            max_output_power_dbm: 20.0,
            gain_flatness_db: 0.5
          },
          supported_models: ["edfa_gain_model"],
          model_params: {
            edfa_gain_model: {
              is_configured: true,
              params: {
                gain_tilt_db_per_nm: 0.01
              }
            }
          },
          commercial_params: {
            unit_price: 250000,
            currency: "USD"
          }
        },
        {
          id: "edfa_high_power_001",
          name: "High Power EDFA",
          type: "EDFA",
          specs: {
            gain_db: 25.0,
            bandwidth_nm: 35.0,
            noise_figure_db: 5.5,
            max_output_power_dbm: 23.0,
            gain_flatness_db: 0.8
          },
          supported_models: ["edfa_gain_model"],
          model_params: {
            edfa_gain_model: {
              is_configured: true,
              params: {
                gain_tilt_db_per_nm: 0.015
              }
            }
          },
          commercial_params: {
            unit_price: 320000,
            currency: "USD"
          }
        },
        {
          id: "bu_3port_001",
          name: "Standard 3-Port BU",
          type: "BU",
          specs: {
            port_count: 3,
            matrix: [
              [0, 1, 1],
              [1, 0, 1],
              [1, 1, 0]
            ],
            thru_pair: [1, 2],
            loss_vals: {
              thru: 0.8,
              branch: 3.5
            }
          },
          supported_models: ["bu_loss_model"],
          model_params: {
            bu_loss_model: {
              is_configured: true,
              params: {}
            }
          },
          commercial_params: {
            unit_price: 180000,
            currency: "USD"
          }
        }
      ],

      // 3.4 计算模型库
      models: [
        {
          model_id: "fiber_linear_loss",
          version: "1.0.0",
          domain: "FIBER",
          display_name: "Fiber Linear Loss Model",
          description: "Calculate linear attenuation loss for optical fiber span",
          entry_point: "fiber_loss.py:calculate_linear_loss",
          language: "python",
          inputs: [
            { param_id: "attenuation", label: "Attenuation Coefficient", unit: "dB/km", type: "float", required: true, source_hint: "fiber.attributes.attenuation" },
            { param_id: "length", label: "Fiber Length", unit: "km", type: "float", required: true, source_hint: "span.length_km" }
          ],
          outputs: [
            { param_id: "total_loss_db", label: "Total Loss", unit: "dB", type: "float" }
          ],
          constraints: [
            { param_id: "length", min: 0, max: 500 }
          ]
        },
        {
          model_id: "fiber_gn_model",
          version: "1.0.0",
          domain: "FIBER",
          display_name: "GN Model",
          description: "Gaussian Noise model for fiber nonlinear interference calculation",
          entry_point: "gn_model.py:calculate_gn",
          language: "python",
          inputs: [
            { param_id: "attenuation", label: "Attenuation", unit: "dB/km", type: "float", required: true, source_hint: "fiber.attributes.attenuation" },
            { param_id: "length", label: "Length", unit: "km", type: "float", required: true, source_hint: "span.length_km" },
            { param_id: "A_eff", label: "Effective Area", unit: "μm²", type: "float", required: true, source_hint: "fiber.attributes.A_eff" },
            { param_id: "n2", label: "Nonlinear Index", unit: "1e-20 m²/W", type: "float", required: true, source_hint: "fiber.attributes.n2" },
            { param_id: "dispersion", label: "Dispersion", unit: "s/m²", type: "float", required: true, source_hint: "fiber.attributes.dispersion" }
          ],
          outputs: [
            { param_id: "nli_power", label: "NLI Power", unit: "dBm", type: "float" },
            { param_id: "gsnr", label: "GSNR", unit: "dB", type: "float" }
          ]
        },
        {
          model_id: "edfa_gain_model",
          version: "1.0.0",
          domain: "EDFA",
          display_name: "EDFA Gain Model",
          description: "Calculate EDFA output power considering saturation",
          entry_point: "edfa_model.py:calculate_gain",
          language: "python",
          inputs: [
            { param_id: "input_power_dbm", label: "Input Power", unit: "dBm", type: "float", required: true, source_hint: "link.input_power_dbm" },
            { param_id: "gain_db", label: "Nominal Gain", unit: "dB", type: "float", required: true, source_hint: "component.specs.gain_db" },
            { param_id: "max_output_power_dbm", label: "Saturation Power", unit: "dBm", type: "float", required: true, source_hint: "component.specs.max_output_power_dbm" }
          ],
          outputs: [
            { param_id: "output_power_dbm", label: "Output Power", unit: "dBm", type: "float" },
            { param_id: "actual_gain_db", label: "Actual Gain", unit: "dB", type: "float" }
          ]
        },
        {
          model_id: "bu_loss_model",
          version: "1.0.0",
          domain: "BU",
          display_name: "BU Loss Model",
          description: "Calculate BU insertion loss based on port configuration",
          entry_point: "bu_model.py:calculate_loss",
          language: "python",
          inputs: [
            { param_id: "input_port", label: "Input Port", unit: "", type: "int", required: true },
            { param_id: "output_port", label: "Output Port", unit: "", type: "int", required: true },
            { param_id: "thru_loss", label: "Thru Loss", unit: "dB", type: "float", required: true, source_hint: "component.specs.loss_vals.thru" },
            { param_id: "branch_loss", label: "Branch Loss", unit: "dB", type: "float", required: true, source_hint: "component.specs.loss_vals.branch" }
          ],
          outputs: [
            { param_id: "loss_db", label: "Insertion Loss", unit: "dB", type: "float" },
            { param_id: "mode", label: "Mode", unit: "", type: "string" }
          ]
        }
      ]
    },

    // ==================== 4. 路由工程模块 ====================
    route_engineering: {
      // 4.1 几何点池 (RPL 路由数据)
      // 格式: [经度, 纬度, 水深(m), 累计距离(km)]
      geometry_pool: [
        [121.5000, 31.2000, -15.0, 0.0],        // 上海登陆站
        [121.6500, 31.1500, -25.0, 18.5],
        [121.8000, 31.1000, -45.0, 37.2],
        [122.0000, 31.0000, -120.0, 62.8],
        [122.5000, 30.8000, -280.0, 118.5],
        [123.0000, 30.6000, -650.0, 174.3],
        [123.5000, 30.4000, -1200.0, 230.1],
        [124.0000, 30.2000, -1800.0, 285.9],     // 中继器1
        [124.5000, 30.0000, -2200.0, 341.7],
        [125.0000, 29.8000, -2600.0, 397.5],
        [125.5000, 29.6000, -2850.0, 453.3],
        [126.0000, 29.5000, -3100.0, 509.1],
        [126.5000, 29.4000, -3200.0, 564.9],
        [127.0000, 29.4000, -3350.0, 620.7],
        [127.5000, 29.5000, -3400.0, 676.5],
        [128.0000, 29.6000, -3300.0, 732.3],     // 中继器2
        [128.5000, 29.8000, -3100.0, 788.1],
        [129.0000, 30.0000, -2900.0, 843.9],
        [129.5000, 30.3000, -2650.0, 899.7],
        [130.0000, 30.6000, -2400.0, 955.5],
        [130.5000, 30.9000, -2100.0, 1011.3],
        [131.0000, 31.2000, -1850.0, 1067.1],
        [131.5000, 31.5000, -1600.0, 1122.9],
        [132.0000, 31.8000, -1350.0, 1178.7],    // 中继器3
        [132.5000, 32.1000, -1100.0, 1234.5],
        [133.0000, 32.4000, -900.0, 1290.3],
        [133.5000, 32.7000, -720.0, 1346.1],
        [134.0000, 33.0000, -550.0, 1401.9],
        [134.5000, 33.3000, -420.0, 1457.7],
        [135.0000, 33.6000, -320.0, 1513.5],
        [135.5000, 33.9000, -250.0, 1569.3],
        [136.0000, 34.2000, -180.0, 1625.1],     // 中继器4
        [136.5000, 34.5000, -150.0, 1680.9],
        [137.0000, 34.8000, -120.0, 1736.7],
        [137.5000, 35.0000, -90.0, 1792.5],
        [138.0000, 35.2000, -60.0, 1848.3],
        [138.5000, 35.4000, -40.0, 1904.1],
        [139.0000, 35.5000, -25.0, 1959.9],
        [139.5000, 35.5500, -15.0, 2015.7],
        [139.7000, 35.6000, -10.0, 2040.0]       // 东京登陆站
      ],

      // 4.2 关键事件点 (中继器、BU、登陆站位置)
      key_events: [
        {
          event_id: "evt_shanghai_landing",
          type: "LandStation",
          geo_index: 0,
          name: "上海崇明登陆站"
        },
        {
          event_id: "evt_rpt_001",
          type: "EDFA",
          geo_index: 7,
          component_ref_id: "edfa_std_cband_001",
          name: "中继器 R1"
        },
        {
          event_id: "evt_rpt_002",
          type: "EDFA",
          geo_index: 15,
          component_ref_id: "edfa_std_cband_001",
          name: "中继器 R2"
        },
        {
          event_id: "evt_rpt_003",
          type: "EDFA",
          geo_index: 23,
          component_ref_id: "edfa_std_cband_001",
          name: "中继器 R3"
        },
        {
          event_id: "evt_rpt_004",
          type: "EDFA",
          geo_index: 31,
          component_ref_id: "edfa_std_cband_001",
          name: "中继器 R4"
        },
        {
          event_id: "evt_tokyo_landing",
          type: "LandStation",
          geo_index: 39,
          name: "东京千叶登陆站"
        }
      ],

      // 4.3 海缆分段 (工程对象)
      segments: [
        {
          segment_id: "seg_001",
          geometry_range: [0, 3],
          cable_struct_ref: "struct_da_001",
          slack_percent: 3.0,
          burial_depth_m: 2.0,
          is_locked: false
        },
        {
          segment_id: "seg_002",
          geometry_range: [3, 7],
          cable_struct_ref: "struct_sa_001",
          slack_percent: 2.5,
          burial_depth_m: 1.5,
          is_locked: false
        },
        {
          segment_id: "seg_003",
          geometry_range: [7, 15],
          cable_struct_ref: "struct_lw_001",
          slack_percent: 2.0,
          burial_depth_m: 0,
          is_locked: false
        },
        {
          segment_id: "seg_004",
          geometry_range: [15, 23],
          cable_struct_ref: "struct_lw_001",
          slack_percent: 2.0,
          burial_depth_m: 0,
          is_locked: false
        },
        {
          segment_id: "seg_005",
          geometry_range: [23, 31],
          cable_struct_ref: "struct_lw_001",
          slack_percent: 2.0,
          burial_depth_m: 0,
          is_locked: false
        },
        {
          segment_id: "seg_006",
          geometry_range: [31, 36],
          cable_struct_ref: "struct_sa_001",
          slack_percent: 2.5,
          burial_depth_m: 1.5,
          is_locked: false
        },
        {
          segment_id: "seg_007",
          geometry_range: [36, 39],
          cable_struct_ref: "struct_da_001",
          slack_percent: 3.0,
          burial_depth_m: 2.0,
          is_locked: false
        }
      ],

      // 4.4 光学传输跨段 (系统对象)
      spans: [
        {
          span_id: "span_01",
          from_event_id: "evt_shanghai_landing",
          from_port_index: 1,
          to_event_id: "evt_rpt_001",
          to_port_index: 1,
          geometry_range: [0, 7],
          fiber_spec_ref: "fiber_g654e_001",
          optical_metrics: {
            span_length_km: 291.8,
            total_loss_db: 46.69,
            osnr_db: 28.5,
            q_factor: 12.3
          },
          is_locked: false
        },
        {
          span_id: "span_02",
          from_event_id: "evt_rpt_001",
          from_port_index: 1,
          to_event_id: "evt_rpt_002",
          to_port_index: 1,
          geometry_range: [7, 15],
          fiber_spec_ref: "fiber_g654e_001",
          optical_metrics: {
            span_length_km: 455.3,
            total_loss_db: 72.85,
            osnr_db: 25.2,
            q_factor: 10.8
          },
          is_locked: false
        },
        {
          span_id: "span_03",
          from_event_id: "evt_rpt_002",
          from_port_index: 1,
          to_event_id: "evt_rpt_003",
          to_port_index: 1,
          geometry_range: [15, 23],
          fiber_spec_ref: "fiber_g654e_001",
          optical_metrics: {
            span_length_km: 455.3,
            total_loss_db: 72.85,
            osnr_db: 24.8,
            q_factor: 10.5
          },
          is_locked: false
        },
        {
          span_id: "span_04",
          from_event_id: "evt_rpt_003",
          from_port_index: 1,
          to_event_id: "evt_rpt_004",
          to_port_index: 1,
          geometry_range: [23, 31],
          fiber_spec_ref: "fiber_g654e_001",
          optical_metrics: {
            span_length_km: 455.3,
            total_loss_db: 72.85,
            osnr_db: 24.5,
            q_factor: 10.2
          },
          is_locked: false
        },
        {
          span_id: "span_05",
          from_event_id: "evt_rpt_004",
          from_port_index: 1,
          to_event_id: "evt_tokyo_landing",
          to_port_index: 1,
          geometry_range: [31, 39],
          fiber_spec_ref: "fiber_g654e_001",
          optical_metrics: {
            span_length_km: 423.1,
            total_loss_db: 67.70,
            osnr_db: 26.1,
            q_factor: 11.2
          },
          is_locked: false
        }
      ]
    },

    // ==================== 5. 系统工程模块 ====================
    system_engineering: {
      // 5.1 WDM 配置
      wdm_config: {
        channel_count: 96,
        center_freq_thz: 193.1,
        channel_spacing_ghz: 50.0,
        baud_rate_gbaud: 64.0,
        launch_power_vector: new Array(96).fill(-1.0),
        initial_ase_vector: new Array(96).fill(-60.0),
        initial_nli_vector: new Array(96).fill(-200.0),
        modulation: "16QAM",
        shaping_moments: {
          moment4: 1.32,
          moment6: 1.90
        }
      },

      // 5.2 仿真缓存
      simulation_cache: {
        is_valid: true,
        timestamp: "2025-01-15T14:30:00Z",
        route_ref: {
          from_station: "evt_shanghai_landing",
          to_station: "evt_tokyo_landing",
          route_hash: "a3f2b8c1d4e5f6a7"
        },
        model_selection: {
          fiber_model_id: "fiber_gn_model",
          edfa_model_id: "edfa_gain_model",
          bu_model_id: null
        },
        span_sequence: ["span_01", "span_02", "span_03", "span_04", "span_05"],
        channel_count: 96,
        metrics: {
          gsnr_matrix_db: [
            new Array(96).fill(18.5),  // span_01 后
            new Array(96).fill(16.2),  // span_02 后
            new Array(96).fill(15.1),  // span_03 后
            new Array(96).fill(14.3),  // span_04 后
            new Array(96).fill(13.8)   // span_05 后 (终端)
          ],
          osnr_matrix_db: [
            new Array(96).fill(25.2),
            new Array(96).fill(22.8),
            new Array(96).fill(21.2),
            new Array(96).fill(20.1),
            new Array(96).fill(19.2)
          ],
          snr_ase_matrix_db: [
            new Array(96).fill(22.5),
            new Array(96).fill(19.8),
            new Array(96).fill(18.2),
            new Array(96).fill(17.1),
            new Array(96).fill(16.3)
          ],
          snr_nli_matrix_db: [
            new Array(96).fill(28.1),
            new Array(96).fill(26.5),
            new Array(96).fill(25.4),
            new Array(96).fill(24.6),
            new Array(96).fill(24.0)
          ]
        },
        summary: {
          total_length_km: 2081.0,
          total_span_count: 5,
          final_gsnr_avg_db: 13.8,
          final_gsnr_min_db: 13.5,
          final_osnr_avg_db: 19.2,
          system_capacity_tbps: 38.4
        }
      },

      // 5.3 系统规划缓存
      system_planning_cache: {
        is_valid: true,
        timestamp: "2025-01-15T10:00:00Z",
        route_ref: {
          from_station: "evt_shanghai_landing",
          to_station: "evt_tokyo_landing",
          route_hash: "a3f2b8c1d4e5f6a7"
        },
        config_hash: "b7d3e9f2c1a8",
        device_selection: {
          fiber_spec_id: "fiber_g654e_001",
          edfa_spec_id: "edfa_std_cband_001",
          bu_spec_id: null
        },
        model_selection: {
          fiber_model_id: "fiber_gn_model",
          edfa_model_id: "edfa_gain_model",
          bu_model_id: null
        },
        sweep_config: {
          span_length_min_km: 60.0,
          span_length_max_km: 150.0,
          span_step_km: 5.0,
          target_gsnr_db: 13.5
        },
        sweep_results: {
          span_lengths_km: [60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150],
          gsnr_per_span_db: [
            [17.2, 16.8, 16.4, 16.0, 15.6, 15.2, 14.8, 14.4, 14.0, 13.7, 13.4, 13.1, 12.8, 12.5, 12.2, 11.9, 11.6, 11.3, 11.0]
          ],
          osnr_per_span_db: [
            [26.5, 25.8, 25.2, 24.6, 24.0, 23.5, 23.0, 22.5, 22.0, 21.5, 21.0, 20.5, 20.0, 19.5, 19.0, 18.5, 18.0, 17.5, 17.0]
          ],
          feasible_range_km: [60.0, 100.0],
          recommended_span_km: 90.0
        },
        user_decision: {
          selected_span_km: 90.0,
          edfa_count: 4,
          decision_time: "2025-01-15T10:30:00Z"
        }
      }
    },

    // ==================== 6. 健康度监控模块 ====================
    health_monitoring: {
      collector_config: {
        gateway_name: "上海-东京海缆网管系统",
        driver_id: "http_rest_client_v1",
        polling_interval: 30,
        connection_params: {
          base_url: "https://nms.submarine-cable.cn/api/v1/devices",
          method: "GET",
          response_format: "json",
          ssl_verify: "true"
        }
      },
      device_mapping: [
        { event_id: "evt_rpt_001", external_index: "ne-rpt-001-shanghai-tokyo" },
        { event_id: "evt_rpt_002", external_index: "ne-rpt-002-shanghai-tokyo" },
        { event_id: "evt_rpt_003", external_index: "ne-rpt-003-shanghai-tokyo" },
        { event_id: "evt_rpt_004", external_index: "ne-rpt-004-shanghai-tokyo" }
      ],
      view_settings: {
        node_positions: {
          "evt_shanghai_landing": [50, 300],
          "evt_rpt_001": [200, 300],
          "evt_rpt_002": [350, 300],
          "evt_rpt_003": [500, 300],
          "evt_rpt_004": [650, 300],
          "evt_tokyo_landing": [800, 300]
        },
        filters: {
          visible_types: ["EDFA", "BU", "LandStation"],
          min_alarm_severity: "ALL"
        }
      }
    }
  }
}

// 主函数：生成 USE 文件
async function generateUSEFile() {
  const projectData = generateSampleProjectData()
  
  // 创建 ZIP 文件
  const zip = new JSZip()
  
  // 添加 project_data.json
  const jsonContent = JSON.stringify(projectData, null, 2)
  zip.file('project_data.json', jsonContent)
  
  // 创建 cache 目录并添加示例缓存文件
  const cacheFolder = zip.folder('cache')
  
  // 添加仿真图表数据缓存
  const simulationChartData = {
    chart_type: "gsnr_evolution",
    x_axis: "Span Index",
    y_axis: "GSNR (dB)",
    data_series: [
      { name: "Channel 1", values: [18.5, 16.2, 15.1, 14.3, 13.8] },
      { name: "Channel 48", values: [18.4, 16.1, 15.0, 14.2, 13.7] },
      { name: "Channel 96", values: [18.3, 16.0, 14.9, 14.1, 13.6] }
    ],
    generated_at: new Date().toISOString()
  }
  cacheFolder?.file('simulation_chart.json', JSON.stringify(simulationChartData, null, 2))
  
  // 生成 ZIP 并保存
  const outputPath = path.join(process.cwd(), 'sample_project.use')
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(outputPath, zipBuffer)
  
  console.log(`✅ 示例 USE 文件已生成: ${outputPath}`)
  console.log(`📦 文件大小: ${(zipBuffer.length / 1024).toFixed(2)} KB`)
  console.log('\n📋 USE 文件内容:')
  console.log('  ├── project_data.json (核心数据)')
  console.log('  └── cache/')
  console.log('      └── simulation_chart.json (仿真图表缓存)')
}

// 执行
generateUSEFile().catch(console.error)
