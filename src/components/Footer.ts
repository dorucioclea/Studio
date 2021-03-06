import { Component, Prop, Vue } from 'vue-property-decorator';
import {store, collapsed, argsAsKvps, log} from '../shared';
import {SiteInvoke} from "../shared/dtos";
import {appendQueryString, combinePaths} from "@servicestack/client";
import {clipboard, setClipboard} from "@servicestack/desktop";

@Component({ template: 
    `<footer id="footer" v-if="!collapsed('footer')">
        <i class="text-close" title="close" @click="hideView('footer')"/>
        <div id="panels">
            <div v-for="x in logEntries" class="log-entry">
                <div v-if="x.invoke" class="invoke">
                    <h4><i>{{x.method}}</i><b>{{x.invoke.request}}</b>
                        <a v-if="store.desktop && x.method == 'GET'" href="javascript:void(0)" @click="copy(createUrl(x.invoke))" title="copy url" 
                           class="svg-copy svg-md mb-1"></a> 
                        <a v-if="x.method == 'GET'" :href="createUrl(x.invoke)" :title="createUrl(x.invoke)" 
                           class="svg-external-link svg-md mb-1" target="_blank"></a> 
                    </h4>
                    <div v-if="x.invoke.args.length" class="body">
                        <dl v-for="x in kvps(x.invoke.args)" class="v-kvp">
                            <dt>{{x.key}}</dt>
                            <dd v-if="x.value!=''" :title="x.value">{{x.value}}</dd>
                        </dl>
                        <dl v-if="x.response" class="v-kvp log-response">
                            <dt v-if="responseVisible(x.id)" @click="toggleResponse(x.id)"><i class="svg svg-chevron-down svg-sm"/>response</dt>
                            <dt v-else @click="toggleResponse(x.id)"><i class="svg svg-chevron-right svg-sm"/>response</dt>
                            <dd v-if="responseVisible(x.id)"><jsonviewer :json="x.response"/></dd>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    </footer>
    <div v-else id="output-group">
        <button class="btn btn-outline-secondary btn-sm" @click="showView('footer')">output</button>        
    </div>`
})
export class Footer extends Vue {
    @Prop() slug: string;

    showResponseIds:number[] = [];
    
    get store() { return store; }
    
    get views() { return this.store.getAppPrefs(this.slug).views || []; }
    
    set views(val) { Vue.set(this.store.getAppPrefs(this.slug), 'views', val); }
    
    collapsed(view:string) { return collapsed(this.slug, view); }

    kvps(args:string[]) { return argsAsKvps(args); }
    
    showView(view:string) {
        this.views = [...this.views, view];
    }
    hideView(view:string) {
        this.views = this.views.filter(x => x != view);
    }
    
    responseVisible(id:number) { return this.showResponseIds.indexOf(id) >= 0; }
    toggleResponse(id:number) {
        if (this.responseVisible(id)) {
            this.showResponseIds = this.showResponseIds.filter(x => x != id);
        } else {
            this.showResponseIds.push(id);
        }
    }
    
    get logEntries() { return this.store.appLogEntries[this.slug] || []; }
    
    get baseUrl() { return store.getSite(this.slug).baseUrl; }
    
    createUrl(invoke:SiteInvoke) {
        if (!invoke) return;
        const op = store.getApp(this.slug).api.operations?.find(x => x.request.name == invoke.request);
        const defaultRoute = op?.routes.find(x => x.path.indexOf('{') == -1);
        let url = defaultRoute
            ? combinePaths(this.baseUrl, defaultRoute.path)
            : combinePaths(this.baseUrl, 'json', 'reply', invoke.request);
        for (var i=0; i<invoke.args?.length ?? 0; i+=2) {
            url += i == 0 ? '?' : '&';
            url += invoke.args[i] + '=' + encodeURIComponent(invoke.args[i + 1]);
        }
        return url;
    }
    
    async copy(text:string) {
        log('copy',text);
        await setClipboard(text); 
    }
}
Vue.component('Footer', Footer);
