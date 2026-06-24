# WordRush Profile Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal WeChat profile authorization flow so WordRush can display and store a user's avatar, nickname, and battle-ready identity.

**Architecture:** Keep `openid` ownership on the cloud side and only let the client submit display profile fields. Add small validation helpers to `cloudfunctions/login/user-rules.js`, expose `saveProfileToCloud()` through the existing cloud API service, and add a focused profile page that stores a local profile cache. The home page only gets a simple "我的" entry; battle and ranking will be implemented in later plans.

**Tech Stack:** Native WeChat Mini Program pages, CloudBase cloud functions, existing `node:test` suite, no third-party dependencies.

---

## File Structure

- Modify: `cloudfunctions/login/user-rules.js`  
  Add `normalizeProfileInput()` and `getPublicUserProfile()` so cloud code has one place to validate display identity.
- Modify: `cloudfunctions/login/index.js`  
  Add `saveProfile` action, persist profile fields, and return `profile` with normal login.
- Modify: `miniprogram/services/cloud-api.js`  
  Add `saveProfileToCloud(profile)` and return `profile` from `login()`.
- Create: `miniprogram/services/profile-service.js`  
  Store local profile cache, normalize fallback display profile, call cloud save.
- Create: `miniprogram/pages/profile/index.js`  
  Load local/cloud profile, handle nickname input, avatar choose event, and save profile.
- Create: `miniprogram/pages/profile/index.json`  
  Set page title to "我的".
- Create: `miniprogram/pages/profile/index.wxml`  
  Render avatar button, nickname input, save button, and basic battle stats placeholders.
- Create: `miniprogram/pages/profile/index.wxss`  
  Style the profile card and authorization controls.
- Modify: `miniprogram/app.json`  
  Register `pages/profile/index`.
- Modify: `miniprogram/pages/home/index.js`  
  Add `openProfile()` navigation method.
- Modify: `miniprogram/pages/home/index.wxml`  
  Add a "我的" entry near settings/header actions.
- Modify: `miniprogram/pages/home/index.wxss`  
  Style the extra home header action without disturbing the current layout.
- Modify: `tests/user-settings-rules.test.js`  
  Add profile validation tests for cloud helper functions.
- Modify: `tests/cloud-api.test.js`  
  Add client cloud API test for `saveProfileToCloud()`.
- Create: `tests/profile-service.test.js`  
  Test local profile cache and cloud save degradation.
- Modify: `tests/project-structure.test.js`  
  Assert profile page is registered.
- Create: `tests/profile-page.test.js`  
  Assert page handlers and authorization controls exist.
- Modify: `tests/home-page.test.js`  
  Assert home page exposes the profile entry.
- Modify: `README.md`  
  Document the new "我的" page and WeChat avatar/nickname authorization.

### Task 1: Cloud Profile Rules

**Files:**
- Modify: `cloudfunctions/login/user-rules.js`
- Modify: `tests/user-settings-rules.test.js`

- [ ] **Step 1: Add failing profile rule tests**

Append these tests to `tests/user-settings-rules.test.js`:

```js
test('云端标准化用户头像昵称并补齐对战统计字段', () => {
  const {
    normalizeProfileInput,
    getPublicUserProfile,
  } = require('../cloudfunctions/login/user-rules');
  const profile = normalizeProfileInput({
    nickname: ' 小词王 ',
    avatarUrl: 'https://example.com/avatar.png',
  });
  assert.deepEqual(profile, {
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
  });

  assert.deepEqual(getPublicUserProfile({
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
    battleScore: 20,
    battleWins: 2,
    battleLosses: 1,
    battleDraws: 1,
    battlePlayed: 4,
  }), {
    nickname: '小词王',
    avatarUrl: 'https://example.com/avatar.png',
    battleScore: 20,
    battleWins: 2,
    battleLosses: 1,
    battleDraws: 1,
    battlePlayed: 4,
  });
});

test('云端拒绝异常头像昵称', () => {
  const { normalizeProfileInput } = require('../cloudfunctions/login/user-rules');
  assert.throws(() => normalizeProfileInput({ nickname: '', avatarUrl: '' }), /用户资料无效/);
  assert.throws(
    () => normalizeProfileInput({ nickname: 'a'.repeat(33), avatarUrl: '' }),
    /用户资料无效/,
  );
  assert.throws(
    () => normalizeProfileInput({ nickname: '小词王', avatarUrl: 12 }),
    /用户资料无效/,
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\user-settings-rules.test.js
```

Expected: FAIL with `normalizeProfileInput is not a function`.

- [ ] **Step 3: Implement profile helpers**

In `cloudfunctions/login/user-rules.js`, add these constants and functions after `DEFAULT_SETTINGS`:

```js
const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0,
};

function normalizeProfileInput(profile = {}) {
  const nickname = String(profile.nickname || '').trim();
  const avatarUrl = String(profile.avatarUrl || '').trim();
  if (!nickname || nickname.length > 32 || avatarUrl.length > 300) {
    throw new Error('用户资料无效');
  }
  return { nickname, avatarUrl };
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function getPublicUserProfile(user = {}) {
  return {
    nickname: user.nickname || DEFAULT_PROFILE.nickname,
    avatarUrl: user.avatarUrl || DEFAULT_PROFILE.avatarUrl,
    battleScore: safeNumber(user.battleScore),
    battleWins: safeNumber(user.battleWins),
    battleLosses: safeNumber(user.battleLosses),
    battleDraws: safeNumber(user.battleDraws),
    battlePlayed: safeNumber(user.battlePlayed),
  };
}
```

Update `createDefaultUser()` to spread `DEFAULT_PROFILE` before settings:

```js
return {
  _openid: openid,
  ...DEFAULT_PROFILE,
  ...normalized,
  totalScore: 0,
};
```

Export the new helpers:

```js
module.exports = {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  WORDBOOK_IDS,
  createDefaultUser,
  getPublicUserProfile,
  normalizeProfileInput,
  validateCloudSettings,
};
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\user-settings-rules.test.js
```

Expected: all tests PASS.

### Task 2: Login Cloud Function Save Profile

**Files:**
- Modify: `cloudfunctions/login/index.js`
- Modify: `tests/user-settings-rules.test.js`

- [ ] **Step 1: Add failing static test for login profile action**

Append this test to `tests/user-settings-rules.test.js`:

```js
test('登录云函数支持保存资料并返回公开资料', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'login', 'index.js'),
    'utf8',
  );
  assert.match(source, /event\.action === 'saveProfile'/);
  assert.match(source, /normalizeProfileInput\(event\.profile\)/);
  assert.match(source, /profile:\s*getPublicUserProfile\(user\)/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\user-settings-rules.test.js
```

Expected: FAIL because `saveProfile` action is absent.

- [ ] **Step 3: Implement `saveProfile` action**

Update the import in `cloudfunctions/login/index.js`:

```js
const {
  createDefaultUser,
  getPublicUserProfile,
  normalizeProfileInput,
  validateCloudSettings,
} = require('./user-rules');
```

After the `saveSettings` block, add:

```js
  if (event.action === 'saveProfile') {
    const profile = normalizeProfileInput(event.profile);
    if (user) {
      await users.doc(OPENID).update({
        data: { ...profile, updatedAt: db.serverDate() },
      });
      user = { ...user, ...profile };
    } else {
      user = createDefaultUser(OPENID);
      await users.doc(OPENID).set({
        data: {
          ...user,
          ...profile,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      });
      user = { ...user, ...profile };
    }
    return {
      success: true,
      profile: getPublicUserProfile(user),
    };
  }
```

Update the final return:

```js
  return {
    openid: OPENID,
    settings: getUserSettings(user),
    profile: getPublicUserProfile(user),
  };
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\user-settings-rules.test.js
```

Expected: all tests PASS.

### Task 3: Client Profile Service and Cloud API

**Files:**
- Modify: `miniprogram/services/cloud-api.js`
- Create: `miniprogram/services/profile-service.js`
- Modify: `tests/cloud-api.test.js`
- Create: `tests/profile-service.test.js`

- [ ] **Step 1: Add failing cloud API test**

Update `tests/cloud-api.test.js` to import and assert `saveProfileToCloud()`:

```js
assert.equal(await saveProfileToCloud({ nickname: '小词王', avatarUrl: '' }), false);
```

In the cloud-enabled test, add `saveProfileToCloud` to the import and assert:

```js
assert.deepEqual(
  await saveProfileToCloud({ nickname: '小词王', avatarUrl: '' }),
  {
    nickname: '小词王',
    avatarUrl: '',
    battleScore: 0,
    battleWins: 0,
    battleLosses: 0,
    battleDraws: 0,
    battlePlayed: 0,
  },
);
assert.equal(calls[3].data.action, 'saveProfile');
```

Adjust expected cloud function names to:

```js
assert.deepEqual(calls.map((item) => item.name), ['login', 'sync-learning', 'login', 'login']);
```

- [ ] **Step 2: Create failing profile service tests**

Create `tests/profile-service.test.js`:

```js
// 用户资料服务测试保证授权信息可以本地缓存，云端不可用时也不影响小程序使用。
const test = require('node:test');
const assert = require('node:assert/strict');

function setupStorage(initial = {}) {
  const storage = { ...initial };
  global.wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => {
      storage[key] = value;
    },
  };
  return storage;
}

function loadService() {
  const servicePath = require.resolve('../miniprogram/services/profile-service');
  delete require.cache[servicePath];
  return require(servicePath);
}

test('空资料返回默认展示身份', () => {
  setupStorage();
  const { loadProfile } = loadService();
  assert.deepEqual(loadProfile(), {
    nickname: 'WordRush 用户',
    avatarUrl: '',
    battleScore: 0,
    battleWins: 0,
    battleLosses: 0,
    battleDraws: 0,
    battlePlayed: 0,
  });
  delete global.wx;
});

test('保存资料时会清洗昵称并写入本地缓存', () => {
  const storage = setupStorage();
  const { saveProfileLocal } = loadService();
  const profile = saveProfileLocal({ nickname: ' 小词王 ', avatarUrl: 'avatar.png' });
  assert.equal(profile.nickname, '小词王');
  assert.deepEqual(storage['wordrush.profile'], profile);
  delete global.wx;
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cloud-api.test.js tests\profile-service.test.js
```

Expected: FAIL because `saveProfileToCloud` and `profile-service` are missing.

- [ ] **Step 4: Implement cloud API profile save**

In `miniprogram/services/cloud-api.js`, add:

```js
async function saveProfileToCloud(profile) {
  if (!wx.cloud) {
    return false;
  }
  const response = await wx.cloud.callFunction({
    name: 'login',
    data: {
      action: 'saveProfile',
      profile,
    },
  });
  if (!response.result || !response.result.success) {
    return false;
  }
  return response.result.profile;
}
```

Export it:

```js
module.exports = {
  login,
  saveProfileToCloud,
  syncLearning,
  saveSettingsToCloud,
};
```

- [ ] **Step 5: Create profile service**

Create `miniprogram/services/profile-service.js`:

```js
const { saveProfileToCloud } = require('./cloud-api');

const PROFILE_KEY = 'wordrush.profile';

const DEFAULT_PROFILE = {
  nickname: 'WordRush 用户',
  avatarUrl: '',
  battleScore: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
  battlePlayed: 0,
};

function normalizeProfile(profile = {}) {
  const nickname = String(profile.nickname || DEFAULT_PROFILE.nickname).trim()
    || DEFAULT_PROFILE.nickname;
  return {
    ...DEFAULT_PROFILE,
    ...profile,
    nickname: nickname.slice(0, 32),
    avatarUrl: String(profile.avatarUrl || ''),
  };
}

function loadProfile() {
  return normalizeProfile(wx.getStorageSync(PROFILE_KEY));
}

function saveProfileLocal(profile) {
  const normalized = normalizeProfile(profile);
  wx.setStorageSync(PROFILE_KEY, normalized);
  return normalized;
}

async function saveProfile(profile) {
  const localProfile = saveProfileLocal(profile);
  const cloudProfile = await saveProfileToCloud({
    nickname: localProfile.nickname,
    avatarUrl: localProfile.avatarUrl,
  });
  if (cloudProfile) {
    return saveProfileLocal(cloudProfile);
  }
  return localProfile;
}

module.exports = {
  DEFAULT_PROFILE,
  loadProfile,
  normalizeProfile,
  saveProfile,
  saveProfileLocal,
};
```

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\cloud-api.test.js tests\profile-service.test.js
```

Expected: all tests PASS.

### Task 4: Profile Page and Home Entry

**Files:**
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/profile/index.js`
- Create: `miniprogram/pages/profile/index.json`
- Create: `miniprogram/pages/profile/index.wxml`
- Create: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/pages/home/index.js`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `tests/project-structure.test.js`
- Create: `tests/profile-page.test.js`
- Modify: `tests/home-page.test.js`

- [ ] **Step 1: Add failing page structure tests**

Append to `tests/project-structure.test.js`:

```js
test('应用注册我的资料页', () => {
  const appPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
  const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  assert.equal(app.pages.includes('pages/profile/index'), true);
});
```

Create `tests/profile-page.test.js`:

```js
// 我的资料页结构测试保证微信授权入口和保存逻辑不会被遗漏。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProfile(extension) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'profile', `index.${extension}`),
    'utf8',
  );
}

test('我的资料页提供头像昵称授权和保存入口', () => {
  const js = readProfile('js');
  const wxml = readProfile('wxml');
  assert.match(js, /loadProfile/);
  assert.match(js, /chooseAvatar/);
  assert.match(js, /inputNickname/);
  assert.match(js, /saveProfile/);
  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /bindchooseavatar="chooseAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.match(wxml, /bindtap="saveProfile"/);
});
```

Append to `tests/home-page.test.js`:

```js
test('首页提供我的资料入口', () => {
  const js = readPage('home', 'js');
  const wxml = readPage('home', 'wxml');
  assert.match(js, /openProfile\(\)/);
  assert.match(wxml, /bindtap="openProfile"/);
  assert.match(wxml, />我的</);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\profile-page.test.js tests\home-page.test.js
```

Expected: FAIL because profile page is not registered or created.

- [ ] **Step 3: Register profile page**

In `miniprogram/app.json`, add:

```json
"pages/profile/index"
```

Place it after `"pages/home/index"` so it is easy to find but does not become the launch page.

- [ ] **Step 4: Create profile page JS**

Create `miniprogram/pages/profile/index.js`:

```js
const {
  loadProfile,
  saveProfile: persistProfile,
} = require('../../services/profile-service');

Page({
  data: {
    profile: {
      nickname: 'WordRush 用户',
      avatarUrl: '',
      battleScore: 0,
      battleWins: 0,
      battleLosses: 0,
      battleDraws: 0,
      battlePlayed: 0,
    },
    saving: false,
  },

  onShow() {
    this.setData({ profile: loadProfile() });
  },

  chooseAvatar(event) {
    // 微信头像选择按钮只返回临时头像地址，用户点击保存后再写入本地和云端。
    this.setData({
      profile: {
        ...this.data.profile,
        avatarUrl: event.detail.avatarUrl,
      },
    });
  },

  inputNickname(event) {
    this.setData({
      profile: {
        ...this.data.profile,
        nickname: event.detail.value,
      },
    });
  },

  async saveProfile() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    try {
      const profile = await persistProfile(this.data.profile);
      this.setData({ profile });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
```

- [ ] **Step 5: Create profile page JSON**

Create `miniprogram/pages/profile/index.json`:

```json
{
  "navigationBarTitleText": "我的"
}
```

- [ ] **Step 6: Create profile page WXML**

Create `miniprogram/pages/profile/index.wxml`:

```xml
<!-- 我的资料页通过用户主动点击保存头像昵称，为后续对战和排行榜提供展示身份。 -->
<view class="page">
  <view class="profile-card">
    <button class="avatar-button" open-type="chooseAvatar" bindchooseavatar="chooseAvatar">
      <image wx:if="{{profile.avatarUrl}}" class="avatar" src="{{profile.avatarUrl}}" mode="aspectFill" />
      <text wx:else class="avatar-placeholder">W</text>
    </button>
    <input class="nickname-input" type="nickname" value="{{profile.nickname}}" bindinput="inputNickname" placeholder="请输入昵称" />
    <button class="primary-button save-button" loading="{{saving}}" bindtap="saveProfile">保存资料</button>
  </view>

  <view class="stats-card">
    <view class="stat-item"><text class="stat-value">{{profile.battleScore}}</text><text class="stat-label">对战积分</text></view>
    <view class="stat-item"><text class="stat-value">{{profile.battleWins}}</text><text class="stat-label">胜场</text></view>
    <view class="stat-item"><text class="stat-value">{{profile.battlePlayed}}</text><text class="stat-label">局数</text></view>
  </view>
</view>
```

- [ ] **Step 7: Create profile page WXSS**

Create `miniprogram/pages/profile/index.wxss`:

```css
/* 我的资料页保留轻量布局，突出头像昵称授权和基础战绩。 */
.profile-card, .stats-card { padding: 34rpx; background: #fff; border-radius: 28rpx; box-shadow: 0 12rpx 36rpx rgba(72, 88, 160, 0.1); }
.profile-card { display: flex; flex-direction: column; align-items: center; }
.avatar-button { display: flex; align-items: center; justify-content: center; width: 150rpx; height: 150rpx; padding: 0; margin: 0 0 24rpx; overflow: hidden; background: #eef0ff; border-radius: 50%; }
.avatar-button::after { border: 0; }
.avatar { width: 150rpx; height: 150rpx; border-radius: 50%; }
.avatar-placeholder { color: #5968e8; font-size: 64rpx; font-weight: 700; }
.nickname-input { box-sizing: border-box; width: 100%; padding: 22rpx 24rpx; text-align: center; background: #f6f8ff; border-radius: 20rpx; font-weight: 700; }
.save-button { width: 100%; margin-top: 24rpx; line-height: 84rpx; }
.stats-card { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20rpx; margin-top: 24rpx; text-align: center; }
.stat-value { display: block; color: #202853; font-size: 34rpx; font-weight: 700; }
.stat-label { display: block; margin-top: 8rpx; color: #718096; font-size: 24rpx; }
```

- [ ] **Step 8: Add home entry**

In `miniprogram/pages/home/index.js`, add:

```js
  openProfile() {
    wx.navigateTo({ url: '/pages/profile/index' });
  },
```

In `miniprogram/pages/home/index.wxml`, add a small header action near the settings button:

```xml
<view class="header-actions">
  <button class="profile-button" bindtap="openProfile">我的</button>
  <button class="settings-button" bindtap="openSettings" aria-label="打开设置">⚙</button>
</view>
```

Replace the existing single settings button with this block.

In `miniprogram/pages/home/index.wxss`, add:

```css
.header-actions { display: flex; align-items: center; gap: 16rpx; }
.profile-button { width: 96rpx; height: 64rpx; padding: 0; color: #5968e8; background: #fff; border-radius: 999rpx; font-size: 24rpx; line-height: 64rpx; }
.profile-button::after { border: 0; }
```

- [ ] **Step 9: Run tests and verify GREEN**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\project-structure.test.js tests\profile-page.test.js tests\home-page.test.js
```

Expected: all tests PASS.

### Task 5: Documentation and Full Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

In `README.md`, add these bullets under `功能`:

```markdown
- 我的资料页：用户可主动授权头像昵称，用于后续对战和排行榜展示。
- 授权资料会先保存在本地，云端可用时同步到 `users` 集合。
```

In `配置 CloudBase`, mention:

```markdown
`users` 集合会保存用户设置、头像昵称和后续对战统计字段。
```

- [ ] **Step 2: Run full tests**

Run:

```powershell
& 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: all tests PASS.

- [ ] **Step 3: Run syntax and JSON checks**

Run:

```powershell
$node = 'C:\Users\xun\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Get-ChildItem miniprogram,cloudfunctions,scripts,tests -Recurse -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "JavaScript 语法检查失败：$($_.FullName)" }
}
Get-ChildItem miniprogram,cloudfunctions -Recurse -Filter *.json | ForEach-Object {
  Get-Content -Encoding UTF8 -Raw $_.FullName | ConvertFrom-Json | Out-Null
}
```

Expected: exit code 0.

- [ ] **Step 4: Check diff scope**

Run:

```powershell
git diff --check
git status --short
```

Expected: only profile authorization files and README are changed, plus any existing WeChat DevTools local config changes remain unstaged.

- [ ] **Step 5: Commit profile authorization**

Run:

```powershell
git add cloudfunctions/login miniprogram/app.json miniprogram/pages/home miniprogram/pages/profile miniprogram/services/cloud-api.js miniprogram/services/profile-service.js tests README.md
git commit -m "feat: add profile authorization"
```

Expected: commit succeeds.
