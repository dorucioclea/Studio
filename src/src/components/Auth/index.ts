import { Vue, Component, Watch, Prop } from 'vue-property-decorator';
import {store, bus, client, Authenticate, loadSite, exec} from '../../shared';
import { redirect, Routes } from '../../shared/router';
import {SiteAuthenticate} from "../../shared/dtos";

const bearerProviders = 'jwt,apikey'.split(',');
const authWithRequestProviders = 'jwt,apikey,basic,digest,identity'.split(',');
const oAuthProviders = 'facebook,google,twitter,github,microsoftgraph,linkedin'.split(',');

@Component({ template: 
    `<div v-if="enabled">
        <button v-if="!session && !loading" @click="showAuthDialog=true" class="btn btn-block btn-outline-primary">
            Sign In
        </button>
        <span v-if="session">
        
            <div class="btn-group" role="group">
                <button v-if="prefsDirty || loading" @click="savePrefs()" title="Save Preferences" 
                        class="btn btn-light btn-sm"><i :class="(loading ? 'svg-loading' : 'svg-save_alt') + ' svg-lg'" /></button>            
                <div class="btn-group" role="group">
                    <button @click="showUserPopup=!showUserPopup" id="btnGroupDrop1" type="button" class="btn btn-light dropdown-toggle">
                        <img v-if="session.profileUrl" :src="session.profileUrl" class="sq-lg mr-1 mb-1">
                        <i v-else class="svg-auth svg-2x mb-1" />
                        {{session.displayName || session.userName || session.email}}
                    </button>
                    <div :class="['dropdown-menu',{show:showUserPopup}]" style="top:45px;left:auto">
                        <a class="dropdown-item" href="javascript:void(0)" @click="logout()">Sign Out</a>
                    </div>            
                </div>
            </div>
        
        </span>
        <div v-if="showAuthDialog" id="signInModal" class="modal" tabindex="-1" role="dialog" 
             :style="{ display:showAuthDialog?'block':'none', background:'rgba(0,0,0,.25)'}">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Sign into {{ appInfo.serviceName }}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="showAuthDialog=false">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <ul class="nav nav-pills mb-3" id="pills-tab" role="tablist">
                    <li class="nav-item" v-if="hasProvider('credentials')" @click="tab='credentials'">
                        <span :class="['nav-link', {active:activeTab('credentials')}]">Credentials</span>
                    </li>
                    <li class="nav-item" v-if="hasBearer" @click="tab='bearer'">
                        <span :class="['nav-link', {active:activeTab('bearer')}]">Token</span>
                    </li>
                    <li class="nav-item" v-if="hasOAuth" @click="tab='oauth'">
                        <span :class="['nav-link', {active:activeTab('oauth')}]">OAuth</span>
                    </li>
                    <li class="nav-item" v-if="hasSession" @click="tab='session'">
                        <span :class="['nav-link', {active:activeTab('session')}]">Session</span>
                    </li>
                    <li class="nav-item" v-if="hasAuthSecret" @click="tab='authsecret'">
                        <span :class="['nav-link', {active:activeTab('authsecret')}]">AuthSecret</span>
                    </li>
                </ul>
                <div class="tab-content" id="pills-tabContent">
                    <div v-if="hasProvider('credentials')" :class="['tab-pane', {active:activeTab('credentials')}]" id="pills-credentials" role="tabpanel">
                        <credentials :slug="slug" @done="showAuthDialog=false" />
                    </div>
                    <div v-if="hasBearer" :class="['tab-pane', {active:activeTab('bearer')}]" id="pills-bearer" role="tabpanel">
                        <bearer-token :slug="slug" @done="showAuthDialog=false" />
                    </div>
                    <div v-if="hasOAuth" :class="['tab-pane', {active:activeTab('oauth')}]" id="pills-oauth" role="tabpanel">
                        <oauth-secret :slug="slug" :providers="oauthProviders" @done="showAuthDialog=false" />
                    </div>
                    <div v-if="hasSession" :class="['tab-pane', {active:activeTab('session')}]" id="pills-session" role="tabpanel">
                        <session-id :slug="slug" @done="showAuthDialog=false" />
                    </div>
                    <div v-if="hasAuthSecret" :class="['tab-pane', {active:activeTab('authsecret')}]" id="pills-authsecret" role="tabpanel">
                        <auth-secret :slug="slug" @done="showAuthDialog=false" />
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>        
    </div>`,
})
export class Auth extends Vue {

    @Prop({ default: null }) slug: string;

    loading = false;
    responseStatus = null;

    showAuthDialog = false;
    showUserPopup = false;
    tab = '';
    userName = '';
    password = '';
    rememberMe = true;

    get store() { return store; }
    
    get site() { return store.getSite(this.slug); }

    get app() { return store.getApp(this.slug); }

    get appInfo() { return store.getApp(this.slug).app; }

    get enabled() { return this.app && store.hasPlugin(this.slug, 'auth'); }

    get plugin() { return this.app?.plugins.auth; }
    
    get session() { return store.getSession(this.slug); }
    
    get prefsDirty() { return store.isDirty(this.slug); }
    
    activeTab(tab:string) { 
        return this.tab ? this.tab == tab : this.plugin && this.plugin.authProviders[0]?.name == tab; 
    }
    
    hasProvider(provider:string) { return this.plugin.authProviders.some(x => x.name == provider); }

    get hasBearer() { return this.plugin.authProviders.some(x => bearerProviders.indexOf(x.name) >= 0); }

    get hasOAuth() { return this.plugin.authProviders.some(x => oAuthProviders.indexOf(x.name) >= 0); }

    get oauthProviders() { return this.plugin.authProviders.filter(x => oAuthProviders.indexOf(x.name) >= 0); }

    get hasSession() { return this.plugin.authProviders.some(x => authWithRequestProviders.indexOf(x.name) == -1); }

    get hasAuthSecret() { return this.plugin.hasAuthSecret; }
    
    modalKeyDown(e:KeyboardEvent) {
        if (this.showAuthDialog && e.key == "Escape") {
            this.showAuthDialog = false;
            return;
        }
        if (e.ctrlKey && e.key === "s") {
            this.savePrefs();
            e.preventDefault();
            return;
        }
    }
    
    beforeDestroy() {
        window.removeEventListener('keydown', this.modalKeyDown);
    }

    async mounted() {
        window.addEventListener('keydown', this.modalKeyDown);
        bus.$on('signin', () => {
            console.log('signin', this.session);
            if (!this.session) {
               this.showAuthDialog = true;
            } 
        });
        
        await exec(this, async () => {
            if (this.app && !this.session)
            {
                try {
                    const response = await client.post(new SiteAuthenticate({
                        slug: this.slug,
                    }));
                    bus.$emit('appSession', { slug:this.slug, result:response });
                } catch (e) {
                    bus.$emit('appSession', { slug:this.slug, result:null });
                    throw e;
                }
            }
        });
    }

    savePrefs() {
        this.loading = true;
        setTimeout(() => this.loading = false, 300);
        bus.$emit('savePrefs', { slug:this.slug });
    }
    
    async logout() {
        await exec(this, async () => {
            const response = await client.post(new SiteAuthenticate({
                slug: this.slug,
                provider: 'logout',
            }));
            bus.$emit('savePrefs', { slug:this.slug, callback:() => {
                bus.$emit('signout', { slug:this.slug });
                this.showUserPopup = false;
            } });
        });
    }
}
export default Auth;
Vue.component('auth', Auth);