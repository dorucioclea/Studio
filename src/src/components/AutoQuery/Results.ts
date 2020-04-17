import Vue from 'vue';
import { Component, Prop, Watch } from 'vue-property-decorator';
import {store, bus, exec, client, canAccess, patchSiteInvoke, log} from '../../shared';
import {MetadataOperationType, MetadataType, SiteInvoke} from "../../shared/dtos";
import {humanize, normalizeKey, toDate, toDateFmt, getField, toCamelCase} from "@servicestack/client";
import {Route} from "vue-router";

@Component({ template:
    `<a v-if="isUrl" :href="value" target="_blank">{{url}}</a>
     <i v-else-if="lower == 'false'" class="svg svg-md bool-off-muted"></i>
     <i v-else-if="lower == 'true'" class="svg svg-md bool-on-muted"></i>
     <span v-else>{{format}}</span>
`})
class FormatString extends Vue {
    @Prop({ default: '' }) public value: any;

    get lower() { return `${this.value}`.toLowerCase(); }
    get isUrl() { return typeof this.value == "string" && this.value.startsWith('http'); }
    get url() { return typeof this.value == "string" && this.value.substring(this.value.indexOf('://') + 3); }
    get format(){ return typeof this.value == "string" && this.value.startsWith('/Date(') ? toDateFmt(this.value) : this.value; }
}
Vue.component('format', FormatString);

@Component({ template:
`<div v-if="results.length">
    <table class="results">
        <thead><tr class="noselect">
            <th v-if="crud.length">
                <i v-if="!session" class="svg svg-btn svg-auth svg-md" title="Sign In to Edit" @click="bus.$emit('signin')" />
                <i v-else-if="createOp" class="svg svg-btn svg-create svg-md" :title="createLabel" @click="show('Create')"/>
            </th>
            <th v-for="f in fieldNames" :key="f" :class="{partial:isPartialField(f)}">
                {{ humanize(f) }}
            </th>
            <th v-if="enableEvents && plugin.crudEvents">
                <i class="svg svg-history history-muted svg-md" title="Event History" />
            </th>
        </tr></thead>
        <tbody>
            <tr v-for="(r,i) in results" :key="i" :class="{ selected:selectedRow(i) }">
                <td v-if="crud.length">
                    <span v-if="hasCrud(['Update','Delete'])">
                        <i v-if="session && hasAccessibleCrud(['Update','Delete'])" class="svg svg-btn svg-update svg-sm" :title="updateLabel" 
                           @click="editRow(i)" />
                        <i v-else class="svg svg-btn svg-auth auth-warning svg-md" title="Sign In" @click="bus.$emit('signin')" />
                    </span>
                </td>
                <td v-for="(f,j) in fieldNames" :key="j" :title="renderValue(getField(r,f))" 
                    :class="{partial:isPartialField(f),editing:isEditingField(i,j), selected:selectedCell(i,j) }" 
                    @click="selectField(i,j)" @dblclick="isPartialField(f) && editField(i,j)"
                >                
                    <span v-if="i==0 && j==0 && showCreate">
                        <create-modal v-if="createOp" :slug="slug" :op="createOp" :type="type" @done="handleDone('Create',$event)" />
                    </span>
                    <div v-else-if="isEditingRow(i) && j == 0">
                        <edit-modal v-if="updateOp || deleteOp" :slug="slug" :updateOp="updateOp" :deleteOp="deleteOp" :type="type" :row="r" 
                                    @done="handleDone('Edit',$event)" />
                    </div>
                    <div v-else-if="isEditingField(i,j)">                        
                        <input v-model="editingValue" class="form-control form-control-sm" 
                               @keydown.enter.stop="saveEdit()" @keydown.esc.stop="cancelEdit()" @blur="onEditBlur()" />                
                        <i v-if="dirty" class="svg done-success svg-md svg-btn" title="save" @click="saveEdit()" style="float:right;margin:-27px 5px 0 0;"/>
                    </div>
                    <format v-else :value="getField(r,f)" />
                </td>
                <td v-if="enableEvents && plugin.crudEvents">
                    <i class="svg svg-history history-muted svg-btn svg-md" title="Event History" />
                </td>
            </tr>
        </tbody>
    </table>
    <error-view :responseStatus="responseStatus" />
</div>
<div v-else class="results-none">
    <div class="ml-1 mb-3">
        <span class="mr-1 d-inline-block">There were no results</span>        
        <button v-if="session && createOp" class="btn btn-outline-primary btn-sm" :title="createLabel" @click="show('Create')"
            >&plus;
            New {{type.name}}
        </button>
    </div>
    <create-modal v-if="session && createOp && showCreate" :slug="slug" :op="createOp" :type="type" @done="handleDone('Create',$event)" />
</div>`,
})
export class Results extends Vue {
    @Prop({ default: '' }) public slug: string;
    @Prop() public results: any[];
    @Prop() public type: MetadataType;
    @Prop({ default:[] }) public crud: MetadataOperationType[];

    loading = false;
    responseStatus:any = null;

    showCreate = false;
    editingValue = '';
    editingRow:number|null = null;
    editingField:number[]|null = null;
    selectedField:number[]|null = null;

    @Watch('$route', { immediate: true, deep: true })
    async onUrlChange(newVal: Route) {
        this.resetEdit();
        this.show('');
    }
    
    get enableEvents() { return false; }
    
    get bus() { return bus; }
    get store() { return store; }
    get session() { return store.getSession(this.slug); }

    get plugin() { return store.getApp(this.slug).plugins.autoQuery; }

    get fields() { return this.type.properties; }
    get fieldNames() { return this.type.properties.map(x => x.name); }
    
    show(tab:string,rowIndex?:number) {
        this.selectedField = null;
        this.showCreate = false; 
        this.editingRow = null;
        
        if (tab === 'Create') {
            this.showCreate = true;
        } else if (tab == 'Edit' && typeof rowIndex == "number") {
            this.editingRow = rowIndex;
        }
    }
    
    handleDone(op:string,e:any) {
        log('handleDone',op,e);
        this.showCreate = false;
        this.editingRow = null;
        if (e) {
            this.$emit('refresh');
        }
    }

    get createOp() { return this.crud.find(x => canAccess(this.slug, x) && x.request.implements.some(i => i.name == "ICreateDb`1")); }

    get updateOp() { return this.crud.find(x => canAccess(this.slug, x) && x.request.implements.some(i => i.name == "IUpdateDb`1")); }
    get deleteOp() { return this.crud.find(x => canAccess(this.slug, x) && x.request.implements.some(i => i.name == "IDeleteDb`1")); }

    isPartialField(f:string) { return this.partialFields.indexOf(f) >= 0; }
    
    get partialFields():string[] {
        let propNames = this.crud.filter(x => canAccess(this.slug, x) && x.request.implements.some(i => i.name == "IPatchDb`1"))
            .map(x => store.getType(this.slug, x.dataModel))
            .map(x => x?.properties.filter(p => !p.isPrimaryKey).map(p => p.name))
            .reduce((a, b) => a?.concat(b || []), []); //flatten
        return propNames || [];
    }

    hasAccessibleCrud(actions:string[]) {
        var crudInterfaces = actions.map(x => `I${x}Db\`1`);
        return this.crud.some(x => canAccess(this.slug,x) && x.request.implements?.some(r => crudInterfaces.indexOf(r.name) >= 0));
    }

    hasCrud(actions:string[]) {
        var crudInterfaces = actions.map(x => `I${x}Db\`1`);
        return this.crud.some(x => x.request.implements?.some(r => crudInterfaces.indexOf(r.name) >= 0));
    }

    humanize(s:string) { return humanize(s); }

    renderValue(o: any) {
        return Array.isArray(o)
            ? o.join(', ')
            : typeof o == "undefined"
                ? ""
                : typeof o == "object"
                    ? JSON.stringify(o)
                    : o + "";
    }

    get createLabel() { return `New ${this.type.name}` }
    get updateLabel() { return `Edit ${this.type.name}` }

    getField(o: any, name: string) { return getField(o,name); }

    get canCreate() {
        return true;
    }

    get canUpdate() {
        return false;
    }
    
    moveSelected(y:number,x:number) {
        if (!this.selectedField) return;
        if (y != 0) {
            const prevY = this.selectedField[0];
            this.$set(this.selectedField, 0, prevY + y >= this.results.length
                ? 0
                : prevY + y < 0
                    ? this.results.length -1
                    : prevY + y);
        }
        if (x != 0) {
            const prevX = this.selectedField[1];
            this.$set(this.selectedField, 1, prevX + x >= this.fieldNames.length 
                ? 0 
                : prevX + x < 0
                    ? this.fieldNames.length -1
                    : prevX + x);
        }
        if (typeof this.editingRow == 'number') {
            this.editingRow = this.selectedField[0];
        }
    }

    onKeyDown(e:KeyboardEvent) {
        if (e.key == "Escape") {
            this.resetEdit();
            this.show('');
        } else if (this.selectedField) {
            if ((document.activeElement as HTMLInputElement)?.form) return;
            
            if (!this.editingField && e.key == "Enter") {
                this.editField(this.selectedField[0],this.selectedField[1]);
            } else if (e.key == 'ArrowUp') {
                this.moveSelected(-1, 0);
            } else if (e.key == 'ArrowDown') {
                this.moveSelected(1, 0);
            } else if (e.key == 'ArrowLeft') {
                this.moveSelected( 0, -1);
            } else if (e.key == 'ArrowRight') {
                this.moveSelected( 0, 1);
            }
        }
    }

    beforeDestroy() {
        window.removeEventListener('keydown', this.onKeyDown);
    }

    mounted() {
        window.addEventListener('keydown', this.onKeyDown);
    }

    isEditingRow(rowIndex:number) {
        return this.editingRow === rowIndex;
    }

    isEditingField(i:number,j:number) {
        return this.editingField && this.editingField[0] === i && this.editingField[1] === j;
    }
    
    get dirty() { return this.editingField && this.editingValue != getField(this.results[this.editingField[0]],this.fieldNames[this.editingField[1]]); }

    selectedRow(rowIndex:number) { return this.selectedField && this.selectedField[0] == rowIndex; }
    selectedCell(rowIndex:number, fieldIndex:number) { return this.selectedField && this.selectedField[0] == rowIndex && this.selectedField[1] == fieldIndex; }
    selectField(rowIndex:number, fieldIndex:number) {
        this.selectedField = [rowIndex,fieldIndex];
    }

    editRow(rowIndex:number) {
        this.editingRow = rowIndex;
        this.selectedField = [rowIndex,0];
    }
    
    editField(rowIndex:number, fieldIndex:number) {
        if (!this.isPartialField(this.fieldNames[fieldIndex])) return;
        window.getSelection()?.removeAllRanges();
        this.editingField = [rowIndex,fieldIndex];
        this.editingValue = getField(this.results[rowIndex],this.fieldNames[fieldIndex]);
        this.$nextTick(() => {
           (document.querySelector('.results .editing input') as HTMLInputElement)?.select(); 
        });
    }
    
    cancelBlur = false;
    
    onEditBlur() {
        this.cancelBlur = false; //allow tick in field to cancel blur
        setTimeout(() => {
            if (!this.cancelBlur) {
                this.cancelEdit();
            }
        }, 300);
    }
    
    cancelEdit() {
        if (!this.editingField) return;
        log('cancelEdit');
        this.resetEdit();
    }
    
    resetEdit() {
        this.responseStatus = null;
        this.editingField = null;
        this.editingValue = '';
    }
    
    // need to find what serialized key (default camelCase) is from schema key (default PascalCase) 
    findKey(rowIndex:number, updateField:string) {
        let foundKey = Object.keys(this.results[rowIndex]).find(k => normalizeKey(k) == normalizeKey(updateField));
        if (foundKey)
            return foundKey;
        for (let i=0; i<this.results.length; i++) {
            foundKey = Object.keys(this.results[i]).find(k => normalizeKey(k) == normalizeKey(updateField));
            if (foundKey)
                return foundKey;
        }
        return toCamelCase(updateField); //assume camelCase default
    }

    async saveEdit() {
        this.cancelBlur = true;
        const rowIndex = this.editingField![0], fieldIndex = this.editingField![1];
        const updateRow = this.results[rowIndex];
        const updateField = this.fieldNames[fieldIndex];
        const patchOp = this.crud.find(x => x.request.implements.some(i => i.name == "IPatchDb`1") &&
            x.request.properties.some(x => x.name == updateField))!;
        const pk = this.type.properties.find(x => x.isPrimaryKey);
        const pkValue = pk && getField(updateRow, pk.name);
        
        if (!updateField || !patchOp || !pk || !pkValue) {
            this.responseStatus = { errorCode: 'InvalidState', message: `Results.saveEdit(): ${updateField}, ${patchOp}, ${pkValue}` };
            return;
        }

        const updateKey = this.findKey(rowIndex, updateField);
        const updateValue = this.editingValue;
        log('saveEdit', updateKey, updateField, this.editingValue, this.dirty, patchOp?.request.name);
        if (!this.dirty) {
            this.cancelEdit();
            return;
        }
        await exec(this, async () => {
            
            const args = [pk.name,pkValue];
            if (updateValue) {
                args.push(updateField);
                args.push(updateValue);
            } else {
                args.push('reset');
                args.push(updateField);
            }
            
            await patchSiteInvoke(new SiteInvoke({ 
                slug:this.slug, 
                request:patchOp.request.name,
                args
            }));

            this.$set(updateRow, updateKey, updateValue);
            this.resetEdit();
        });
    }
}
export default Results;
Vue.component('results',Results);
